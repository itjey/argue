import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, ChevronDown, Info, Mic, Paperclip, Search, Square, X, Copy, Pencil, Check } from 'lucide-react'
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
import { DebateConfigPanel } from './DebateConfigPanel'
import { DebateMetricsSummary } from './DebateMetricsSummary'
import { TemplateManager } from './TemplateManager'
import { DEFAULT_DEBATE_CONFIG, validateDebateConfig, type DebateConfig } from '../lib/debateConfig'
import { runDebateSession, type RoundStage } from '../lib/debateEngine'
import type { RoundMetrics } from '../lib/debateMetrics'
import { OPENROUTER_KEY_STORAGE } from '../lib/openrouterStorage'

const SYSTEM_PROMPT = `You are a helpful assistant. Format your responses using Markdown.

Formatting rules:
- **Math**: Use $...$ for inline math and $$...$$ for display/block equations. Do NOT use \\( \\) or \\[ \\] — use $ and $$ only.
- **Tables**: Use GFM Markdown tables (pipes | and dashes ---) for any tabular data.
- **Code**: Use fenced code blocks with a language hint, e.g. \`\`\`python.
- **LaTeX documents**: When a rendered document is useful, return the full document in a fenced \`\`\`latex block.
- **Lists**: Use - for bullet lists, 1. for numbered lists.
- **Bold/italic**: Use **bold** and *italic* for emphasis.
Keep responses clear and well-structured.`

interface DebateWorkspaceProps {
  currentUser: User
}

interface AttachedFile {
  id: string
  name: string
  dataUrl: string
  mimeType: string
}

interface DebateRoundOutput {
  stage: RoundStage
  participantOutputs: Map<string, {
    content: string
    reasoning?: string
    alias: string
    role: string
    status: 'pending' | 'thinking' | 'done'
  }>
  metrics?: RoundMetrics
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
  stoppedThinking?: boolean
  webSearch?: {
    enabled: boolean
    approximateQuery: string
    citations: OpenRouterUrlCitation[]
    searching: boolean
  }
  // Debate-specific
  isDebate?: boolean
  debateRounds?: DebateRoundOutput[]
  debateSynthesis?: string
  debateSynthesisStreaming?: boolean
  debateComplete?: boolean
  debateCurrentLabel?: string
  debateRoundMetrics?: RoundMetrics[]
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

function getReasoningStyle(model: OpenRouterModel): ReasoningStyle {
  const params = new Set((model.supported_parameters ?? []).map((p) => p.toLowerCase()))
  if (params.has('reasoning')) return 'effort'
  if (params.has('include_reasoning')) return 'include'
  return 'none'
}

const EFFORT_LEVELS: { value: OpenRouterReasoningEffort; label: string; desc: string }[] = [
  { value: 'xhigh', label: 'Max', desc: 'Best for extremely hard math proofs, novel research questions, and multi-step competitive programming.' },
  { value: 'high', label: 'High', desc: 'Best for complex coding, multi-step reasoning, and detailed analysis.' },
  { value: 'medium', label: 'Medium', desc: 'Best for everyday questions, summarization, and moderate reasoning tasks.' },
  { value: 'low', label: 'Low', desc: 'Best for simple Q&A, quick lookups, and straightforward tasks.' },
  { value: 'minimal', label: 'Minimal', desc: 'Near-instant responses with almost no internal reasoning.' },
]

type WebSearchModelCategory = 'free' | 'metered' | 'unsupported'

function formatWebSearchPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 'Web search'
  if (value === 0) return 'Free web search'
  return `$${value.toFixed(value >= 0.1 ? 2 : 3).replace(/0+$/, '').replace(/\.$/, '')}/search`
}

function getWebSearchModelProfile(model: OpenRouterModel | null) {
  if (!model) {
    return { supported: false, category: 'unsupported' as WebSearchModelCategory, price: null, priceLabel: 'Web search unavailable', providerLabel: 'Standard' }
  }
  const rawPrice = model.pricing?.web_search
  if (rawPrice == null) {
    return { supported: false, category: 'unsupported' as WebSearchModelCategory, price: null, priceLabel: 'Web search unavailable', providerLabel: model.id.split('/')[0] }
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

/** Ensure **Title** section headers in reasoning text appear on their own paragraph. */
function normalizeReasoningText(text: string): string {
  return text.replace(/([^\n])(\*\*[A-Z][^*\n]{0,80}\*\*)/g, '$1\n\n$2')
}

export function DebateWorkspace({ currentUser }: DebateWorkspaceProps) {
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

  // Debate config
  const [debateConfig, setDebateConfig] = useState<DebateConfig>(DEFAULT_DEBATE_CONFIG)
  const [configCollapsed, setConfigCollapsed] = useState(true)
  const [useDebateMode, setUseDebateMode] = useState(false)

  // model selector (for single-model fallback)
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
  const abortControllerRef = useRef<AbortController | null>(null)
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

  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return
    lastScrollTopRef.current = el.scrollTop
    const onScroll = () => {
      const scrolledUp = el.scrollTop < lastScrollTopRef.current
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
      if (scrolledUp) shouldAutoScrollRef.current = false
      else if (nearBottom) shouldAutoScrollRef.current = true
      lastScrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

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

  async function runSingleStream(historyBefore: ChatMessage[], userMsg: ChatMessage) {
    const apiKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    if (!apiKey.trim() || !selectedModel) {
      const errorId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        {
          id: errorId,
          role: 'assistant',
          content: !apiKey.trim()
            ? 'Please add your OpenRouter API key in Settings before chatting.'
            : 'Please select a model first.',
          error: true,
        },
      ])
      return
    }

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
        webSearch: webSearchRequested ? { enabled: true, approximateQuery: approximateSearchQuery, citations: [], searching: true } : undefined,
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
        webSearchOptions: webSearchRequested ? { search_context_size: 'high' } : undefined,
        onProgress: (reply) => {
          if (abortedRef.current) return
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m
              const thinkingDuration = reply.text && !m.thinkingDuration ? Date.now() - (m.thinkingStart ?? thinkingStart) : m.thinkingDuration
              return {
                ...m,
                content: reply.text,
                reasoning: reply.reasoning || m.reasoning,
                thinkingDuration,
                webSearch: m.webSearch ? { ...m.webSearch, citations: reply.citations.length > 0 ? reply.citations : m.webSearch.citations, searching: !reply.text && reply.citations.length === 0 } : undefined,
              }
            })
          )
        },
      })
      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? {
              ...m,
              content: finalReply.text,
              reasoning: finalReply.reasoning || m.reasoning,
              streaming: false,
              thinkingDuration: m.thinkingDuration ?? (Date.now() - thinkingStart),
              webSearch: m.webSearch ? { ...m.webSearch, citations: finalReply.citations.length > 0 ? finalReply.citations : m.webSearch.citations, searching: false } : undefined,
            } : m
          )
        )
      }
    } catch (err: unknown) {
      if (!abortedRef.current) {
        const msg = err instanceof Error ? err.message : 'An error occurred.'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: msg, streaming: false, error: true, webSearch: m.webSearch ? { ...m.webSearch, searching: false } : undefined } : m
          )
        )
      }
    } finally {
      setStreaming(false)
    }
  }

  async function runDebate(_historyBefore: ChatMessage[], userMsg: ChatMessage) {
    const apiKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    if (!apiKey.trim()) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Please add your OpenRouter API key in Settings before chatting.', error: true },
      ])
      return
    }

    const configErrors = validateDebateConfig(debateConfig)
    if (configErrors.length > 0) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Configuration errors:\n${configErrors.join('\n')}`, error: true },
      ])
      return
    }

    const assistantId = crypto.randomUUID()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        isDebate: true,
        debateRounds: [],
        debateSynthesis: '',
        debateSynthesisStreaming: false,
        debateComplete: false,
        debateCurrentLabel: 'Starting debate…',
        debateRoundMetrics: [],
      },
    ])
    setStreaming(true)
    abortedRef.current = false

    // Mutable state for tracking current debate round outputs
    const currentRoundOutputs = new Map<string, { content: string; reasoning?: string; alias: string; role: string; status: 'pending' | 'thinking' | 'done' }>()

    function syncDebateMessage(updates: Partial<ChatMessage>) {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, ...updates } : m)
      )
    }

    try {
      await runDebateSession(
        debateConfig,
        userMsg.content,
        apiKey,
        {
          onRoundStart: (stage) => {
            // Round started
            currentRoundOutputs.clear()
            // Initialize all participants as pending for this round
            for (const p of debateConfig.participants) {
              currentRoundOutputs.set(p.id, { content: '', alias: p.alias, role: p.role, status: 'pending' })
            }
            syncDebateMessage({ debateCurrentLabel: `${stage}…` })
          },
          onParticipantProgress: (participantId, stage, reply) => {
            const existing = currentRoundOutputs.get(participantId)
            if (existing) {
              existing.content = reply.text
              existing.reasoning = reply.reasoning
              existing.status = 'thinking'
            }

            if (stage === 'synthesis') {
              syncDebateMessage({
                debateSynthesis: reply.text,
                debateSynthesisStreaming: true,
                debateCurrentLabel: 'Synthesizing…',
              })
            } else {
              syncDebateMessage({
                debateCurrentLabel: `${stage}: ${existing?.alias ?? participantId} thinking…`,
              })
            }
          },
          onParticipantComplete: (participantId, _stage, record) => {
            const existing = currentRoundOutputs.get(participantId)
            if (existing) {
              existing.content = record.rawOutput
              existing.status = 'done'
            }
          },
          onRoundComplete: (stage, roundMetrics) => {
            // Snapshot the current round outputs into the completed rounds list
            const roundOutput: DebateRoundOutput = {
              stage,
              participantOutputs: new Map(currentRoundOutputs),
              metrics: roundMetrics,
            }

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m
                return {
                  ...m,
                  debateRounds: [...(m.debateRounds ?? []), roundOutput],
                  debateRoundMetrics: [...(m.debateRoundMetrics ?? []), roundMetrics],
                }
              })
            )
          },
          onComplete: (synthesis, allRounds) => {
            syncDebateMessage({
              content: synthesis,
              streaming: false,
              debateSynthesis: synthesis,
              debateSynthesisStreaming: false,
              debateComplete: true,
              debateCurrentLabel: '',
              debateRoundMetrics: allRounds,
            })
          },
          onError: (error) => {
            syncDebateMessage({
              content: error.message,
              streaming: false,
              error: true,
              debateComplete: true,
              debateCurrentLabel: '',
            })
          },
        },
        controller.signal,
      )
    } catch (err) {
      if (!abortedRef.current) {
        syncDebateMessage({
          content: err instanceof Error ? err.message : String(err),
          streaming: false,
          error: true,
          debateComplete: true,
          debateCurrentLabel: '',
        })
      }
    } finally {
      setStreaming(false)
      abortControllerRef.current = null
    }
  }

  async function handleSubmit() {
    const text = prompt.trim()
    if (!text && attachments.length === 0) return
    if (streaming) return

    // For debate mode, we don't need a single model selected
    if (!useDebateMode && !selectedModel) return

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

    if (useDebateMode) {
      await runDebate(historyBefore, userMsg)
    } else {
      await runSingleStream(historyBefore, userMsg)
    }
  }

  function startEdit(msg: ChatMessage) {
    setEditingId(msg.id)
    setPrompt(msg.content)
    setTimeout(() => { textareaRef.current?.focus(); autoResize() }, 0)
  }

  function stopStream() {
    abortedRef.current = true
    abortControllerRef.current?.abort()
    setStreaming(false)
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
          debateSynthesisStreaming: false,
          debateComplete: true,
          debateCurrentLabel: '',
        }
      })
    })
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
    { key: 'free', label: 'Web search included', models: filteredModels.filter((m) => getWebSearchModelProfile(m).category === 'free') },
    { key: 'metered', label: 'Web search available', models: filteredModels.filter((m) => getWebSearchModelProfile(m).category === 'metered') },
    { key: 'unsupported', label: 'No OpenRouter web search', models: filteredModels.filter((m) => getWebSearchModelProfile(m).category === 'unsupported') },
  ].filter((g) => g.models.length > 0)

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
            {infoModel.description && <p className="model-info-description">{infoModel.description}</p>}
            <div className="model-info-meta">
              {infoModel.context_length && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Context</span>
                  <strong>{infoModel.context_length.toLocaleString()} tokens</strong>
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
              <ModelStatsPanel modelName={infoModel.name} statsEntry={statsEntry} statsError={statsError} statsLoading={statsLoading} />
            </div>
          </aside>
        </div>
      )}

      <div className={`prompt-page${hasMessages ? ' prompt-page-chat' : ''}`}>
        {/* Debate config panel */}
        {useDebateMode && (
          <div className="debate-config-wrapper">
            <DebateConfigPanel
              config={debateConfig}
              models={models}
              onChange={setDebateConfig}
              collapsed={configCollapsed}
              onToggleCollapse={() => setConfigCollapsed((c) => !c)}
            />
            {!configCollapsed && currentUser && (
              <TemplateManager
                userId={currentUser.uid}
                currentConfig={debateConfig}
                onLoadTemplate={(config) => setDebateConfig(config)}
              />
            )}
          </div>
        )}

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
                        {msg.isDebate ? (
                          <>
                            {/* Live thinking indicator */}
                            {msg.streaming && msg.debateCurrentLabel && (
                              <div className="chat-thinking-row">
                                <span className="chat-thinking-pulse">{msg.debateCurrentLabel}</span>
                              </div>
                            )}

                            {/* Round outputs */}
                            {msg.debateRounds?.map((round, ri) => {
                              const doneCount = Array.from(round.participantOutputs.values()).filter((p) => p.status === 'done').length
                              const totalCount = round.participantOutputs.size

                              return (
                                <details key={ri} className="group-phase-details" open={ri === (msg.debateRounds?.length ?? 0) - 1}>
                                  <summary className="group-phase-summary">
                                    <span className="group-phase-label">{round.stage}</span>
                                    <span className="group-phase-meta">{doneCount}/{totalCount} models</span>
                                  </summary>
                                  <div className="group-phase-runs">
                                    {Array.from(round.participantOutputs.entries()).map(([pId, output]) => (
                                      <div key={pId} className={`group-run group-run-${output.status}`}>
                                        <div className="group-run-header">
                                          <span className="group-run-model">{output.alias}</span>
                                          <span className="group-run-role">{output.role}</span>
                                          {output.status === 'thinking' && <span className="chat-thinking-pulse group-run-thinking">thinking…</span>}
                                        </div>
                                        {output.content && <MarkdownBlock>{output.content}</MarkdownBlock>}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )
                            })}

                            {/* Synthesis */}
                            {(msg.debateSynthesisStreaming || msg.debateSynthesis) && (
                              <div className="group-synthesis">
                                <div className="group-synthesis-header">
                                  <span>✦ Final Answer</span>
                                  {msg.debateSynthesisStreaming && <span className="chat-thinking-pulse">Synthesizing…</span>}
                                </div>
                                <MarkdownBlock>{msg.debateSynthesis ?? ''}</MarkdownBlock>
                              </div>
                            )}

                            {/* Metrics summary */}
                            {msg.debateComplete && msg.debateRoundMetrics && msg.debateRoundMetrics.length > 0 && (
                              <DebateMetricsSummary rounds={msg.debateRoundMetrics} />
                            )}
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
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
              placeholder={editingId ? 'Edit your message…' : useDebateMode ? 'Ask a question for the debate…' : 'Ask anything…'}
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

                {/* Debate mode toggle */}
                <button
                  className={`prompt-pill-btn${useDebateMode ? ' prompt-pill-btn-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setUseDebateMode((v) => !v)
                    if (!useDebateMode) setConfigCollapsed(false)
                  }}
                  title="Toggle debate mode"
                >
                  <span>{useDebateMode ? '⚔ Debate' : '⚔ Debate'}</span>
                </button>

                {!useDebateMode && (
                  <>
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
                            {filteredModels.length === 0 && <p className="model-list-empty">No models found</p>}
                            {groupedModels.map((group) => (
                              <div key={group.key} className="model-list-group">
                                <p className="model-list-group-label">{group.label}</p>
                                {group.models.map((m) => {
                                  const webSearchProfile = getWebSearchModelProfile(m)
                                  return (
                                    <div key={m.id} className={`model-list-item${selectedModel?.id === m.id ? ' model-list-item-active' : ''}`}>
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
                                        </div>
                                      </button>
                                      <button className="model-list-info-btn" type="button" onClick={(e) => openInfoPanel(e, m)} aria-label={`Info for ${m.name}`}><Info size={13} /></button>
                                    </div>
                                  )
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Reasoning effort selector */}
                    {(reasoningStyle === 'effort' || reasoningStyle === 'include') && (
                      <div className="model-selector effort-selector" ref={effortDropRef}>
                        <button
                          className="model-selector-trigger"
                          type="button"
                          onClick={() => reasoningStyle === 'effort' && setEffortOpen((o) => !o)}
                          title="Reasoning depth"
                        >
                          <span className="model-selector-name">
                            {reasoningStyle === 'include' ? 'Thinking' : (EFFORT_LEVELS.find((e) => e.value === reasoningEffort)?.label ?? 'Thinking')}
                          </span>
                          {reasoningStyle === 'effort' && (
                            <ChevronDown size={13} className={`model-selector-chevron${effortOpen ? ' model-selector-chevron-open' : ''}`} />
                          )}
                        </button>
                        {effortOpen && reasoningStyle === 'effort' && (
                          <div className="effort-dropdown">
                            {EFFORT_LEVELS.map((level) => (
                              <div key={level.value} className={`effort-option${reasoningEffort === level.value ? ' effort-option-active' : ''}`}>
                                <button type="button" className="effort-option-select" onClick={() => { setReasoningEffort(level.value); setEffortOpen(false) }}>
                                  <span className="effort-option-label">{level.label}</span>
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
                        onClick={() => setWebSearchEnabled((v) => !v)}
                        title={selectedWebSearchProfile.priceLabel}
                      >
                        <Search size={15} />
                        <span>{webSearchEnabled ? 'Web on' : 'Web off'}</span>
                      </button>
                    )}
                  </>
                )}

                {useDebateMode && (
                  <div className="group-disclaimer">
                    <span className="group-disclaimer-icon">⚔</span>
                    <span>{debateConfig.participants.length} models · {debateConfig.roundCount} round{debateConfig.roundCount !== 1 ? 's' : ''}</span>
                  </div>
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
              <button type="button" className="prompt-edit-cancel" onClick={() => { setEditingId(null); setPrompt('') }}>
                Cancel
              </button>
            </p>
          )}
        </div>
      </div>
    </>
  )
}
