// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Paperclip, Mic, ChevronDown, Search, X, Info, Copy, Pencil, Check } from 'lucide-react'
import {
  fetchOpenRouterModels,
  createOpenRouterChatCompletionStream,
  type OpenRouterModel,
  type OpenRouterChatMessage,
  type OpenRouterReasoningEffort,
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
  isReasoningModel?: boolean   // true when sent to a model with reasoning param
  thinkingStart?: number
  thinkingDuration?: number
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
  const chatEndRef = useRef<HTMLDivElement>(null)
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

  // scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
    const assistantId = crypto.randomUUID()
    const thinkingStart = Date.now()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true, thinkingStart, isReasoningModel },
    ])
    setStreaming(true)
    abortedRef.current = false

    const apiMessages = buildApiMessages([...historyBefore, userMsg])

    try {
      await createOpenRouterChatCompletionStream({
        apiKey,
        model: selectedModel.id,
        messages: apiMessages,
        includeReasoning,
        reasoning: reasoningConfig,
        onProgress: (reply) => {
          if (abortedRef.current) return
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m
              const thinkingDuration =
                reply.text && !m.thinkingDuration
                  ? Date.now() - (m.thinkingStart ?? thinkingStart)
                  : m.thinkingDuration
              return { ...m, content: reply.text, reasoning: reply.reasoning || m.reasoning, thinkingDuration }
            })
          )
        },
      })
      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, thinkingDuration: m.thinkingDuration ?? (Date.now() - thinkingStart) }
              : m
          )
        )
      }
    } catch (err: unknown) {
      if (!abortedRef.current) {
        const msg = err instanceof Error ? err.message : 'An error occurred.'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: msg, streaming: false, error: true } : m
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

  const filteredModels = modelSearch.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase()))
    : models

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
          <div className="chat-container">
            {messages.map((msg) => (
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
                            className="chat-thinking-toggle"
                            type="button"
                            onClick={() => toggleThinking(msg.id)}
                          >
                            {msg.streaming && !msg.content && !msg.reasoning ? (
                              <span className="chat-thinking-pulse">Thinking…</span>
                            ) : msg.thinkingDuration != null ? (
                              <span>Thought for {Math.round(msg.thinkingDuration / 1000)}s</span>
                            ) : msg.streaming ? (
                              <span className="chat-thinking-pulse">Thinking…</span>
                            ) : (
                              <span>Thoughts</span>
                            )}
                            <ChevronDown
                              size={12}
                              className={`chat-thinking-chevron${expandedThinking.has(msg.id) ? ' chat-thinking-chevron-open' : ''}`}
                            />
                          </button>
                          {expandedThinking.has(msg.id) && (
                            <div className="chat-thinking-content">
                              {msg.reasoning
                                ? <MarkdownBlock>{msg.reasoning}</MarkdownBlock>
                                : <span className="chat-thinking-empty">No reasoning trace exposed by this provider.</span>
                              }
                            </div>
                          )}
                        </div>
                      )}
                      <MarkdownBlock>{msg.content}</MarkdownBlock>
                      {msg.streaming && msg.content && <span className="chat-typing-dot" />}
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
            ))}
            <div ref={chatEndRef} />
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
                        {filteredModels.map((m) => (
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
                              title={level.desc}
                            >
                              <Info size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                  className={`prompt-submit${(prompt.trim() || attachments.length > 0) ? ' prompt-submit-active' : ''}`}
                  type="button"
                  disabled={(!prompt.trim() && attachments.length === 0) || streaming}
                  onClick={handleSubmit}
                  aria-label="Submit"
                >
                  <ArrowUp size={18} />
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
