// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Square, Paperclip, Mic, ChevronDown, Search, X, Info, Copy, Pencil, Check } from 'lucide-react'
import {
  fetchOpenRouterModels,
  createOpenRouterChatCompletionStream,
  type OpenRouterModel,
  type OpenRouterChatMessage,
  type OpenRouterReasoningEffort,
  type OpenRouterUrlCitation,
} from '../lib/openrouter'
import { MarkdownBlock } from './RichMessageContent'
import {
  fetchOpenRouterStatsSnapshot,
  resolveOpenRouterModelStats,
  type OpenRouterStatsSnapshot,
  type OpenRouterModelStatsEntry,
} from '../lib/openrouterStats'
import { ModelStatsPanel } from './ModelStatsPanel'

const OPENROUTER_KEY_STORAGE = 'argue-openrouter-api-key'
const WEB_SEARCH_PREFERENCES_STORAGE = 'argue-web-search-preferences'

const SYSTEM_PROMPT = `You are a helpful assistant. Format your responses using Markdown.

Formatting rules:
- **Math**: Use $...$ for inline math and $$...$$ for display/block equations. Do NOT use \\( \\) or \\[ \\] — use $ and $$ only.
- **Tables**: Use GFM Markdown tables (pipes | and dashes ---) for any tabular data.
- **Code**: Use fenced code blocks with a language hint, e.g. \`\`\`python.
- **Lists**: Use - for bullet lists, 1. for numbered lists.
- **Bold/italic**: Use **bold** and *italic* for emphasis.
Keep responses clear and well-structured.`

interface CollaborationWorkspaceProps {
  currentUser: User
}

interface AttachedFile {
  id: string
  name: string
  dataUrl: string
  mimeType: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AttachedFile[]
  streaming?: boolean
  error?: boolean
  reasoning?: string
  isReasoningModel?: boolean
  thinkingStart?: number
  thinkingDuration?: number
  stoppedThinking?: boolean   // true if user stopped during thinking phase
  webSearch?: {
    enabled: boolean
    approximateQuery: string
    citations: OpenRouterUrlCitation[]
    searching: boolean
  }
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any
  }
}

function isMultimodal(model: OpenRouterModel) {
  const inputs = model.architecture?.input_modalities ?? []
  return inputs.some((m) => m === 'image' || m === 'file')
}

type ReasoningStyle = 'effort' | 'include' | 'none'

/** Determine how this model surfaces reasoning to callers.
 *  - 'effort': has the `reasoning` param (object with effort/summary/etc) — all major reasoning models
 *  - 'include': only has `include_reasoning` toggle, no effort control
 *  - 'none': no reasoning params at all
 */
function getReasoningStyle(model: OpenRouterModel): ReasoningStyle {
  const params = new Set((model.supported_parameters ?? []).map((p) => p.toLowerCase()))
  if (params.has('reasoning')) return 'effort'          // GPT-5.4, Claude, Gemini, DeepSeek, etc.
  if (params.has('include_reasoning')) return 'include' // binary-only toggle
  return 'none'
}

const EFFORT_LEVELS: { value: OpenRouterReasoningEffort; label: string; desc: string }[] = [
  { value: 'xhigh',   label: 'Max',     desc: 'Best for extremely hard math proofs, novel research questions, and multi-step competitive programming. Highest cost and latency.' },
  { value: 'high',    label: 'High',    desc: 'Best for complex coding, multi-step reasoning, and detailed analysis. Good balance of depth and speed.' },
  { value: 'medium',  label: 'Medium',  desc: 'Best for everyday questions, summarization, and moderate reasoning tasks. Faster and cheaper.' },
  { value: 'low',     label: 'Low',     desc: 'Best for simple Q&A, quick lookups, and straightforward tasks. Fast responses.' },
  { value: 'minimal', label: 'Minimal', desc: 'Near-instant responses with almost no internal reasoning. Best for trivial tasks and autocomplete-style use.' },
]

/** Ensure **Title** section headers in reasoning text appear on their own paragraph. */
function normalizeReasoningText(text: string): string {
  return text.replace(/([^\n])(\*\*[A-Z][^*\n]{0,80}\*\*)/g, '$1\n\n$2')
}

function buildApiMessages(messages: ChatMessage[]): OpenRouterChatMessage[] {
  const history: OpenRouterChatMessage[] = messages
    .filter((m) => !m.streaming && !m.error)
    .map((m): OpenRouterChatMessage => {
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [{ type: 'text', text: m.content }]
        for (const att of m.attachments) {
          if (att.mimeType.startsWith('image/')) {
            parts.push({ type: 'image_url', image_url: { url: att.dataUrl } })
          }
        }
        return { role: 'user', content: parts }
      }
      return { role: m.role, content: m.content }
    })
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
}

type WebSearchModelCategory = 'free' | 'metered' | 'unsupported'

function formatWebSearchPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return 'Web search'
  }

  if (value === 0) {
    return 'Free web search'
  }

  return `$${value.toFixed(value >= 0.1 ? 2 : 3).replace(/0+$/, '').replace(/\.$/, '')}/search`
}

function getWebSearchModelProfile(model: OpenRouterModel | null) {
  if (!model) {
    return {
      supported: false,
      category: 'unsupported' as WebSearchModelCategory,
      price: null,
      priceLabel: 'Web search unavailable',
      providerLabel: 'Standard',
    }
  }

  const rawPrice = model.pricing?.web_search

  if (rawPrice == null) {
    return {
      supported: false,
      category: 'unsupported' as WebSearchModelCategory,
      price: null,
      priceLabel: 'Web search unavailable',
      providerLabel: model.id.split('/')[0],
    }
  }

  const numericPrice = Number(rawPrice)
  const category: WebSearchModelCategory = numericPrice === 0 ? 'free' : 'metered'

  return {
    supported: true,
    category,
    price: Number.isFinite(numericPrice) ? numericPrice : null,
    priceLabel: formatWebSearchPrice(Number.isFinite(numericPrice) ? numericPrice : null),
    providerLabel: model.id.split('/')[0],
  }
}

function readWebSearchPreferences() {
  if (typeof window === 'undefined') {
    return {} as Record<string, boolean>
  }

  try {
    const rawValue = window.localStorage.getItem(WEB_SEARCH_PREFERENCES_STORAGE)

    if (!rawValue) {
      return {} as Record<string, boolean>
    }

    const parsed = JSON.parse(rawValue) as Record<string, unknown>

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    )
  } catch {
    return {} as Record<string, boolean>
  }
}

function writeWebSearchPreference(modelId: string, enabled: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  const nextPreferences = {
    ...readWebSearchPreferences(),
    [modelId]: enabled,
  }

  window.localStorage.setItem(
    WEB_SEARCH_PREFERENCES_STORAGE,
    JSON.stringify(nextPreferences),
  )
}

export function CollaborationWorkspace(_props: CollaborationWorkspaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [listening, setListening] = useState(false)
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [streaming, setStreaming] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const [reasoningEffort, setReasoningEffort] = useState<OpenRouterReasoningEffort>('high')
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [effortOpen, setEffortOpen] = useState(false)
  const effortDropRef = useRef<HTMLDivElement>(null)

  // model selector
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel | null>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const modelSearchRef = useRef<HTMLInputElement>(null)
  const modelDropRef = useRef<HTMLDivElement>(null)

  // model info panel
  const [infoModel, setInfoModel] = useState<OpenRouterModel | null>(null)
  const [statsSnapshot, setStatsSnapshot] = useState<OpenRouterStatsSnapshot | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const abortedRef = useRef(false)

  useEffect(() => {
    fetchOpenRouterModels().then((list) => setModels(list)).catch(() => {})
  }, [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setModelSearch('')
      }
      if (effortDropRef.current && !effortDropRef.current.contains(e.target as Node)) {
        setEffortOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (modelOpen) setTimeout(() => modelSearchRef.current?.focus(), 40)
  }, [modelOpen])

  useEffect(() => {
    const profile = getWebSearchModelProfile(selectedModel)

    if (!selectedModel || !profile.supported) {
      setWebSearchEnabled(false)
      return
    }

    const savedPreferences = readWebSearchPreferences()
    setWebSearchEnabled(savedPreferences[selectedModel.id] ?? true)
  }, [selectedModel])

  useEffect(() => {
    const profile = getWebSearchModelProfile(selectedModel)

    if (!selectedModel || !profile.supported) {
      return
    }

    writeWebSearchPreference(selectedModel.id, webSearchEnabled)
  }, [selectedModel, webSearchEnabled])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
      setPrompt(transcript)
      autoResize()
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
  }, [])

  // Track whether user has scrolled away from the bottom
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return
    lastScrollTopRef.current = el.scrollTop

    const onScroll = () => {
      const scrolledUp = el.scrollTop < lastScrollTopRef.current
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24

      if (scrolledUp) {
        shouldAutoScrollRef.current = false
      } else if (nearBottom) {
        shouldAutoScrollRef.current = true
      }

      lastScrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Smart auto-scroll: only follow the bottom if the user hasn't scrolled up
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el || !shouldAutoScrollRef.current) return

    el.scrollTop = el.scrollHeight
    lastScrollTopRef.current = el.scrollTop
  }, [messages])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }

  function toggleVoice() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) { rec.stop(); setListening(false) }
    else { rec.start(); setListening(true) }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => setAttachments((prev) => [...prev, {
        id: crypto.randomUUID(), name: file.name,
        dataUrl: reader.result as string, mimeType: file.type,
      }])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  function openInfoPanel(e: React.MouseEvent, model: OpenRouterModel) {
    e.stopPropagation()
    setInfoModel(model)
    if (!statsSnapshot && !statsLoading) {
      setStatsLoading(true)
      fetchOpenRouterStatsSnapshot()
        .then((snap) => { setStatsSnapshot(snap); setStatsLoading(false) })
        .catch(() => { setStatsError('Could not load stats.'); setStatsLoading(false) })
    }
  }

  async function runStream(historyBefore: ChatMessage[], userMsg: ChatMessage) {
    const apiKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    if (!apiKey.trim() || !selectedModel) return

    const style = getReasoningStyle(selectedModel)
    const includeReasoning = style !== 'none'
    const reasoningConfig = style === 'effort' ? { effort: reasoningEffort } : undefined

    const isReasoningModel = style !== 'none'
    const selectedWebSearchProfile = getWebSearchModelProfile(selectedModel)
    const webSearchRequested = selectedWebSearchProfile.supported && webSearchEnabled
    const approximateSearchQuery = userMsg.content.trim() || 'Attached content'
    const assistantId = crypto.randomUUID()
    const thinkingStart = Date.now()
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        thinkingStart,
        isReasoningModel,
        webSearch: webSearchRequested
          ? {
              enabled: true,
              approximateQuery: approximateSearchQuery,
              citations: [],
              searching: true,
            }
          : undefined,
      },
    ])
    setStreaming(true)
    abortedRef.current = false

    const apiMessages = buildApiMessages([...historyBefore, userMsg])

    try {
      const finalReply = await createOpenRouterChatCompletionStream({
        apiKey,
        model: selectedModel.id,
        messages: apiMessages,
        includeReasoning,
        reasoning: reasoningConfig,
        plugins: webSearchRequested ? [{ id: 'web' }] : undefined,
        webSearchOptions: webSearchRequested
          ? { search_context_size: 'high' }
          : undefined,
        onProgress: (reply) => {
          if (abortedRef.current) return
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m
              const thinkingDuration =
                reply.text && !m.thinkingDuration
                  ? Date.now() - (m.thinkingStart ?? thinkingStart)
                  : m.thinkingDuration
              return {
                ...m,
                content: reply.text,
                reasoning: reply.reasoning || m.reasoning,
                thinkingDuration,
                webSearch: m.webSearch
                  ? {
                      ...m.webSearch,
                      citations:
                        reply.citations.length > 0
                          ? reply.citations
                          : m.webSearch.citations,
                      searching: !reply.text && reply.citations.length === 0,
                    }
                  : undefined,
              }
            })
          )
        },
      })
      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalReply.text,
                  reasoning: finalReply.reasoning || m.reasoning,
                  streaming: false,
                  thinkingDuration: m.thinkingDuration ?? (Date.now() - thinkingStart),
                  webSearch: m.webSearch
                    ? {
                        ...m.webSearch,
                        citations:
                          finalReply.citations.length > 0
                            ? finalReply.citations
                            : m.webSearch.citations,
                        searching: false,
                      }
                    : undefined,
                }
              : m
          )
        )
      }
    } catch (err: unknown) {
      if (!abortedRef.current) {
        const msg = err instanceof Error ? err.message : 'An error occurred.'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: msg,
                  streaming: false,
                  error: true,
                  webSearch: m.webSearch ? { ...m.webSearch, searching: false } : undefined,
                }
              : m
          )
        )
      }
    } finally {
      setStreaming(false)
    }
  }

  async function handleSubmit() {
    const text = prompt.trim()
    if (!text && attachments.length === 0) return
    if (streaming) return

    shouldAutoScrollRef.current = true

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }

    const historyBefore = editingId
      ? messages.slice(0, messages.findIndex((m) => m.id === editingId))
      : messages

    setMessages([...historyBefore, userMsg])
    setPrompt('')
    setAttachments([])
    setEditingId(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    await runStream(historyBefore, userMsg)
  }

  function startEdit(msg: ChatMessage) {
    setEditingId(msg.id)
    setPrompt(msg.content)
    setTimeout(() => {
      textareaRef.current?.focus()
      autoResize()
    }, 0)
  }

  function stopStream() {
    abortedRef.current = true
    setStreaming(false)
    // Finalize the assistant message and find the last user message in one pass
    let lastUserMsg: ChatMessage | undefined
    setMessages((prev) => {
      lastUserMsg = [...prev].reverse().find((m) => m.role === 'user')
      return prev.map((m) => {
        if (m.role !== 'assistant' || !m.streaming) return m
        return {
          ...m,
          streaming: false,
          stoppedThinking: !m.content && m.isReasoningModel,
          thinkingDuration: m.thinkingDuration ?? (m.thinkingStart ? Date.now() - m.thinkingStart : undefined),
          webSearch: m.webSearch ? { ...m.webSearch, searching: false } : undefined,
        }
      })
    })
    // Auto-open the last user message for editing
    if (lastUserMsg) setTimeout(() => startEdit(lastUserMsg!), 0)
  }

  function copyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  function toggleThinking(id: string) {
    setExpandedThinking((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const supportsFiles = selectedModel ? isMultimodal(selectedModel) : false
  const hasMessages = messages.length > 0
  const reasoningStyle = selectedModel ? getReasoningStyle(selectedModel) : 'none'
  const selectedWebSearchProfile = getWebSearchModelProfile(selectedModel)
  const supportsWebSearch = selectedWebSearchProfile.supported

  const filteredModels = modelSearch.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase()))
    : models

  const groupedModels = [
    {
      key: 'free',
      label: 'Web search included',
      models: filteredModels.filter(
        (model) => getWebSearchModelProfile(model).category === 'free',
      ),
    },
    {
      key: 'metered',
      label: 'Web search available',
      models: filteredModels.filter(
        (model) => getWebSearchModelProfile(model).category === 'metered',
      ),
    },
    {
      key: 'unsupported',
      label: 'No OpenRouter web search',
      models: filteredModels.filter(
        (model) => getWebSearchModelProfile(model).category === 'unsupported',
      ),
    },
  ].filter((group) => group.models.length > 0)

  let statsEntry: OpenRouterModelStatsEntry | null = null
  if (statsSnapshot && infoModel) statsEntry = resolveOpenRouterModelStats(statsSnapshot, infoModel)

  return (
    <>
      {/* Model info side panel */}
      {infoModel && (
        <div className="model-info-overlay" onPointerDown={() => setInfoModel(null)}>
          <aside className="model-info-panel" onPointerDown={(e) => e.stopPropagation()}>
            <div className="model-info-header">
              <div>
                <p className="model-info-eyebrow">Model info</p>
                <h3 className="model-info-title">{infoModel.name}</h3>
                <p className="model-info-id">{infoModel.id}</p>
              </div>
              <button className="model-info-close" type="button" onClick={() => setInfoModel(null)}>
                <X size={18} />
              </button>
            </div>

            {infoModel.description && (
              <p className="model-info-description">{infoModel.description}</p>
            )}

            <div className="model-info-meta">
              {infoModel.context_length && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Context</span>
                  <strong>{infoModel.context_length.toLocaleString()} tokens</strong>
                </span>
              )}
              {infoModel.architecture?.input_modalities && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Inputs</span>
                  <strong>{infoModel.architecture.input_modalities.join(', ')}</strong>
                </span>
              )}
              {infoModel.pricing?.prompt && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Input</span>
                  <strong>${(Number(infoModel.pricing.prompt) * 1_000_000).toFixed(2)}/M</strong>
                </span>
              )}
              {infoModel.pricing?.completion && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Output</span>
                  <strong>${(Number(infoModel.pricing.completion) * 1_000_000).toFixed(2)}/M</strong>
                </span>
              )}
            </div>

            <div className="model-info-stats">
              <ModelStatsPanel
                modelName={infoModel.name}
                statsEntry={statsEntry}
                statsError={statsError}
                statsLoading={statsLoading}
              />
            </div>
          </aside>
        </div>
      )}

      <div className={`prompt-page${hasMessages ? ' prompt-page-chat' : ''}`}>
        {/* Chat history */}
        {hasMessages && (
          <div className="chat-container" ref={chatContainerRef}>
            {messages.map((msg) => {
              const hasReasoningTrace = Boolean(msg.reasoning?.trim())
              const isThinkingExpanded = hasReasoningTrace && expandedThinking.has(msg.id)

              return (
              <div key={msg.id} className={`chat-row chat-row-${msg.role}`}>
                <div className={`chat-bubble chat-bubble-${msg.role}${msg.error ? ' chat-bubble-error' : ''}`}>
                  {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                    <div className="chat-attachments">
                      {msg.attachments.map((a) => (
                        <div key={a.id} className="chat-attachment-pill">
                          {a.mimeType.startsWith('image/') ? (
                            <img src={a.dataUrl} alt={a.name} className="chat-attachment-thumb" />
                          ) : (
                            <Paperclip size={11} />
                          )}
                          <span>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div className="chat-markdown">
                      {/* thinking / reasoning block — shown for reasoning models only */}
                      {msg.isReasoningModel && (
                        <div className="chat-thinking-row">
                          <button
                            className={`chat-thinking-toggle${hasReasoningTrace ? '' : ' chat-thinking-toggle-disabled'}`}
                            type="button"
                            disabled={!hasReasoningTrace}
                            aria-expanded={isThinkingExpanded}
                            onClick={() => toggleThinking(msg.id)}
                          >
                            {msg.streaming && !msg.content && !msg.reasoning ? (
                              <span className="chat-thinking-pulse">Thinking…</span>
                            ) : msg.stoppedThinking ? (
                              <span className="chat-thinking-stopped">Stopped thinking</span>
                            ) : msg.thinkingDuration != null ? (
                              <span>Thought for {Math.round(msg.thinkingDuration / 1000)}s</span>
                            ) : msg.streaming ? (
                              <span className="chat-thinking-pulse">Thinking…</span>
                            ) : (
                              <span>Thoughts</span>
                            )}
                          </button>
                          {isThinkingExpanded && (
                            <div className="chat-thinking-content">
                              <MarkdownBlock>{normalizeReasoningText(msg.reasoning ?? '')}</MarkdownBlock>
                            </div>
                          )}
                        </div>
                      )}
                      <MarkdownBlock>{msg.content}</MarkdownBlock>
                    </div>
                  ) : (
                    <p className="chat-user-text">{msg.content}</p>
                  )}
                </div>

                <div className={`chat-actions chat-actions-${msg.role}`}>
                  <button
                    className={`chat-action-btn${copiedId === msg.id ? ' chat-action-btn-done' : ''}`}
                    type="button"
                    onClick={() => copyMessage(msg.id, msg.content)}
                    aria-label="Copy"
                    title="Copy"
                  >
                    {copiedId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  {msg.role === 'user' && !streaming && (
                    <button
                      className="chat-action-btn"
                      type="button"
                      onClick={() => startEdit(msg)}
                      aria-label="Edit"
                      title="Edit & resend"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}

        {/* Input area */}
        <div className={`prompt-center${hasMessages ? ' prompt-center-sticky' : ''}`}>
          <div className="prompt-box">
            {attachments.length > 0 && (
              <div className="prompt-attachments">
                {attachments.map((a) => (
                  <div key={a.id} className="prompt-attachment-pill">
                    {a.mimeType.startsWith('image/') ? (
                      <img src={a.dataUrl} alt={a.name} className="prompt-attachment-thumb" />
                    ) : (
                      <Paperclip size={12} />
                    )}
                    <span>{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.id)} aria-label="Remove">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="prompt-textarea"
              placeholder={editingId ? 'Edit your message…' : 'Ask anything…'}
              value={prompt}
              rows={1}
              onChange={(e) => { setPrompt(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />

            <div className="prompt-actions">
              <div className="prompt-actions-left">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.md,.csv"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  className={`prompt-pill-btn${!supportsFiles ? ' prompt-pill-btn-disabled' : ''}`}
                  type="button"
                  disabled={!supportsFiles}
                  onClick={() => supportsFiles && fileInputRef.current?.click()}
                  title={supportsFiles ? 'Attach file' : 'Select a multimodal model to attach files'}
                >
                  <Paperclip size={15} />
                  <span>Attach</span>
                </button>

                <div className="model-selector" ref={modelDropRef}>
                  <button
                    className="model-selector-trigger"
                    type="button"
                    onClick={() => setModelOpen((o) => !o)}
                  >
                    <span className="model-selector-name">
                      {selectedModel ? selectedModel.name : 'Search models'}
                    </span>
                    <ChevronDown size={13} className={`model-selector-chevron${modelOpen ? ' model-selector-chevron-open' : ''}`} />
                  </button>

                  {modelOpen && (
                    <div className="model-dropdown">
                      <div className="model-search-wrap">
                        <Search size={13} className="model-search-icon" />
                        <input
                          ref={modelSearchRef}
                          className="model-search-input"
                          placeholder="Search models…"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          spellCheck={false}
                        />
                      </div>
                      <div className="model-list">
                        {filteredModels.length === 0 && (
                          <p className="model-list-empty">No models found</p>
                        )}
                        {groupedModels.map((group) => (
                          <div key={group.key} className="model-list-group">
                            <p className="model-list-group-label">{group.label}</p>
                            {group.models.map((m) => {
                              const webSearchProfile = getWebSearchModelProfile(m)

                              return (
                                <div
                                  key={m.id}
                                  className={`model-list-item${selectedModel?.id === m.id ? ' model-list-item-active' : ''}`}
                                >
                                  <button
                                    className="model-list-select"
                                    type="button"
                                    onClick={() => {
                                      setSelectedModel(m)
                                      setModelOpen(false)
                                      setModelSearch('')
                                      if (!isMultimodal(m)) setAttachments([])
                                    }}
                                  >
                                    <span className="model-list-name">{m.name}</span>
                                    <span className="model-list-id">{m.id}</span>
                                    <div className="model-list-badges">
                                      {webSearchProfile.supported && (
                                        <span className={`model-list-badge${webSearchProfile.category === 'free' ? ' model-list-badge-free' : ' model-list-badge-metered'}`}>
                                          {webSearchProfile.priceLabel}
                                        </span>
                                      )}
                                      <span className="model-list-badge model-list-badge-provider">
                                        {webSearchProfile.providerLabel}
                                      </span>
                                    </div>
                                  </button>
                                  <button
                                    className="model-list-info-btn"
                                    type="button"
                                    onClick={(e) => openInfoPanel(e, m)}
                                    aria-label={`Info for ${m.name}`}
                                  >
                                    <Info size={13} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reasoning effort selector — styled like model selector pill */}
                {(reasoningStyle === 'effort' || reasoningStyle === 'include') && (
                  <div className="model-selector effort-selector" ref={effortDropRef}>
                    <button
                      className="model-selector-trigger"
                      type="button"
                      onClick={() => reasoningStyle === 'effort' && setEffortOpen((o) => !o)}
                      title="Reasoning depth"
                    >
                      <span className="model-selector-name">
                        {reasoningStyle === 'include'
                          ? 'Thinking'
                          : (EFFORT_LEVELS.find((e) => e.value === reasoningEffort)?.label ?? 'Thinking')}
                      </span>
                      {reasoningStyle === 'effort' && (
                        <ChevronDown size={13} className={`model-selector-chevron${effortOpen ? ' model-selector-chevron-open' : ''}`} />
                      )}
                    </button>

                    {effortOpen && reasoningStyle === 'effort' && (
                      <div className="effort-dropdown">
                        {EFFORT_LEVELS.map((level) => (
                          <div
                            key={level.value}
                            className={`effort-option${reasoningEffort === level.value ? ' effort-option-active' : ''}`}
                          >
                            <button
                              type="button"
                              className="effort-option-select"
                              onClick={() => { setReasoningEffort(level.value); setEffortOpen(false) }}
                            >
                              <span className="effort-option-label">{level.label}</span>
                            </button>
                            <button
                              type="button"
                              className="effort-option-info"
                              onClick={(e) => { e.stopPropagation() }}
                            >
                              <Info size={13} />
                              <span className="effort-tooltip">{level.desc}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {supportsWebSearch && (
                  <button
                    className={`prompt-pill-btn${webSearchEnabled ? ' prompt-pill-btn-active' : ''}`}
                    type="button"
                    onClick={() => setWebSearchEnabled((value) => !value)}
                    title={selectedWebSearchProfile.priceLabel}
                    aria-pressed={webSearchEnabled}
                  >
                    <Search size={15} />
                    <span>Web on</span>
                  </button>
                )}
              </div>

              <div className="prompt-actions-right">
                <button
                  className={`prompt-mic${listening ? ' prompt-mic-active' : ''}`}
                  type="button"
                  onClick={toggleVoice}
                  aria-label={listening ? 'Stop recording' : 'Start voice input'}
                >
                  <Mic size={18} />
                </button>
                <button
                  className={`prompt-submit${streaming ? ' prompt-submit-active' : (prompt.trim() || attachments.length > 0) ? ' prompt-submit-active' : ''}`}
                  type="button"
                  disabled={!streaming && !prompt.trim() && attachments.length === 0}
                  onClick={streaming ? stopStream : handleSubmit}
                  aria-label={streaming ? 'Stop' : 'Submit'}
                >
                  {streaming ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}
                </button>
              </div>
            </div>
          </div>

          {editingId && (
            <p className="prompt-edit-notice">
              Editing — submit to replace &amp; resend
              <button
                type="button"
                className="prompt-edit-cancel"
                onClick={() => { setEditingId(null); setPrompt('') }}
              >
                Cancel
              </button>
            </p>
          )}
        </div>
      </div>
    </>
  )
}
