import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Loader,
  Replace,
  Search,
  Square,
} from 'lucide-react'
import {
  fetchOpenRouterModels,
  createOpenRouterChatCompletionStream,
  type OpenRouterModel,
  type OpenRouterChatMessage,
  type OpenRouterReasoningEffort,
} from '../lib/openrouter'
import { MarkdownBlock } from './RichMessageContent'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { OPENROUTER_KEY_STORAGE } from '../lib/openrouterStorage'
import { getProviderLogoUrl, providerNeedsInvert } from '../lib/providerLogos'

interface WriteAiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  streaming?: boolean
  error?: boolean
  thinkingDuration?: number
  thinkingStart?: number
  modelName?: string
}

const WRITE_SYSTEM_PROMPT = `You are an expert LaTeX writing assistant embedded in a scientific document editor. The user's full LaTeX source is provided below. You can:

- Draft, revise, and improve prose
- Fix LaTeX errors and suggest corrections
- Generate equations, tables, TikZ diagrams
- Check argument consistency and structure
- Answer questions about the document content
- Suggest structural improvements

When suggesting code changes, show the exact LaTeX code to use. Use $...$ for inline math and $$...$$ for display math in your explanations.

Here is the user's current LaTeX document:
\`\`\`latex
{SOURCE}
\`\`\``

function getReasoningStyle(model: OpenRouterModel) {
  const params = new Set((model.supported_parameters ?? []).map((p) => p.toLowerCase()))
  if (params.has('reasoning')) return 'effort' as const
  if (params.has('include_reasoning')) return 'include' as const
  return 'none' as const
}

function WriteAiCodeBlock({
  code,
  lang,
  onApply,
}: {
  code: string
  lang: string
  onApply?: (code: string) => void
}) {
  const [applied, setApplied] = useState(false)
  const isLatex = ['latex', 'tex', ''].includes(lang.toLowerCase()) && code.includes('\\')

  function handleApply() {
    onApply?.(code)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  return (
    <div className="write-ai-codeblock">
      <div className="write-ai-codeblock-header">
        <span>{lang || 'code'}</span>
        {isLatex && onApply && (
          <button
            className={`write-ai-apply-btn${applied ? ' write-ai-apply-btn-done' : ''}`}
            type="button"
            onClick={handleApply}
          >
            {applied ? <><Check size={12} /> Applied</> : <><Replace size={12} /> Apply to document</>}
          </button>
        )}
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

export function WriteAiSidebar({
  source,
  onApplyEdit,
}: {
  source: string
  onApplyEdit?: (newSource: string) => void
}) {
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const [resizing, setResizing] = useState(false)
  const sidebarWidthRef = useRef(340)

  useEffect(() => { sidebarWidthRef.current = sidebarWidth }, [sidebarWidth])

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidthRef.current
    setResizing(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const delta = startX - moveEvent.clientX
      const next = Math.max(260, Math.min(700, startWidth + delta))
      setSidebarWidth(next)
    }

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', cleanup)
      document.removeEventListener('mouseleave', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', cleanup)
    document.addEventListener('mouseleave', cleanup)
  }
  const [messages, setMessages] = useState<WriteAiMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel | null>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const [collabMode, setCollabMode] = useState(false)
  const [collabModels, setCollabModels] = useState<OpenRouterModel[]>([])
  const [collabRounds, setCollabRounds] = useState(2)

  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modelSearchRef = useRef<HTMLInputElement>(null)
  const modelDropRef = useRef<HTMLDivElement>(null)
  const abortedRef = useRef(false)

  useEffect(() => {
    fetchOpenRouterModels().then((list) => setModels(list)).catch(() => {})
  }, [])

  useEffect(() => {
    if (modelOpen) setTimeout(() => modelSearchRef.current?.focus(), 40)
  }, [modelOpen])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setModelSearch('')
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const filteredModels = modelSearch.trim()
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : models

  function addCollabModel(model: OpenRouterModel) {
    if (!collabModels.find((m) => m.id === model.id)) {
      setCollabModels((prev) => [...prev, model])
    }
  }

  function removeCollabModel(id: string) {
    setCollabModels((prev) => prev.filter((m) => m.id !== id))
  }

  async function handleCollabSubmit() {
    const text = prompt.trim()
    if (!text || collabModels.length < 2 || streaming) return

    const apiKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    if (!apiKey) return

    const userMsg: WriteAiMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setPrompt('')
    setStreaming(true)
    abortedRef.current = false

    const systemPrompt = WRITE_SYSTEM_PROMPT.replace('{SOURCE}', source)
    let conversationHistory: OpenRouterChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ]

    for (let round = 0; round < collabRounds; round++) {
      for (const model of collabModels) {
        if (abortedRef.current) break

        const assistantId = crypto.randomUUID()
        const modelLabel = model.name
        const thinkingStart = Date.now()

        const roundPrompt = round === 0 && conversationHistory.length === 2
          ? conversationHistory
          : [
              ...conversationHistory,
              { role: 'user' as const, content: `You are "${modelLabel}". Build on the previous responses. Add your perspective, improvements, or corrections.` },
            ]

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', streaming: true, thinkingStart, modelName: modelLabel } as WriteAiMessage & { modelName: string },
        ])

        try {
          const style = getReasoningStyle(model)
          const finalReply = await createOpenRouterChatCompletionStream({
            apiKey,
            model: model.id,
            messages: roundPrompt,
            includeReasoning: style !== 'none',
            reasoning: style === 'effort' ? { effort: 'high' as OpenRouterReasoningEffort } : undefined,
            onProgress: (reply) => {
              if (abortedRef.current) return
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: reply.text, reasoning: reply.reasoning || m.reasoning, thinkingDuration: reply.text && !m.thinkingDuration ? Date.now() - thinkingStart : m.thinkingDuration }
                    : m,
                ),
              )
            },
          })

          if (!abortedRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: finalReply.text, reasoning: finalReply.reasoning || m.reasoning, streaming: false, thinkingDuration: m.thinkingDuration ?? Date.now() - thinkingStart }
                  : m,
              ),
            )
            conversationHistory.push({ role: 'assistant', content: `[${modelLabel}]: ${finalReply.text}` })
          }
        } catch (err) {
          if (!abortedRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: err instanceof Error ? err.message : 'Error', streaming: false, error: true }
                  : m,
              ),
            )
          }
        }
      }
    }

    setStreaming(false)
  }

  async function handleSubmit() {
    if (collabMode) {
      return handleCollabSubmit()
    }
    const text = prompt.trim()
    if (!text || !selectedModel || streaming) return

    const apiKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    if (!apiKey) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Add your OpenRouter API key in Account → Settings first.',
          error: true,
        },
      ])
      return
    }

    const userMsg: WriteAiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }

    const style = getReasoningStyle(selectedModel)
    const includeReasoning = style !== 'none'
    const reasoningConfig = style === 'effort' ? { effort: 'high' as OpenRouterReasoningEffort } : undefined

    const assistantId = crypto.randomUUID()
    const thinkingStart = Date.now()

    setMessages((prev) => [...prev, userMsg])
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        thinkingStart,
      },
    ])
    setPrompt('')
    setStreaming(true)
    abortedRef.current = false

    const systemPrompt = WRITE_SYSTEM_PROMPT.replace('{SOURCE}', source)
    const history: OpenRouterChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((m) => !m.streaming && !m.error)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]

    try {
      const finalReply = await createOpenRouterChatCompletionStream({
        apiKey,
        model: selectedModel.id,
        messages: history,
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
              return {
                ...m,
                content: reply.text,
                reasoning: reply.reasoning || m.reasoning,
                thinkingDuration,
              }
            }),
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
                  thinkingDuration: m.thinkingDuration ?? Date.now() - thinkingStart,
                }
              : m,
          ),
        )
      }
    } catch (err) {
      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: err instanceof Error ? err.message : 'An error occurred.',
                  streaming: false,
                  error: true,
                }
              : m,
          ),
        )
      }
    } finally {
      setStreaming(false)
    }
  }

  function stopStream() {
    abortedRef.current = true
    setStreaming(false)
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming ? { ...m, streaming: false } : m,
      ),
    )
  }

  function toggleThinking(id: string) {
    setExpandedThinking((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="write-ai-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
      {resizing && <div className="write-ai-resize-overlay" />}
      <div className="write-ai-resize-handle" onMouseDown={onResizeMouseDown}>
        <span className="write-ai-resize-grip" />
      </div>
      <div className="write-ai-header">
        <div className="write-ai-header-left">
          <span className="write-ai-title">Assistant</span>
          <button
            className={`write-ai-collab-toggle${collabMode ? ' write-ai-collab-toggle-on' : ''}`}
            type="button"
            onClick={() => setCollabMode((v) => !v)}
            title={collabMode ? 'Switch to single model' : 'Switch to collab mode'}
          >
            {collabMode ? 'Collab' : 'Solo'}
          </button>
        </div>
        <div className="write-ai-model-selector" ref={modelDropRef}>
          <button
            className="write-ai-model-trigger"
            type="button"
            onClick={() => setModelOpen((o) => !o)}
          >
            {selectedModel && (
              <img
                className={`write-ai-model-logo${providerNeedsInvert(selectedModel.id) ? ' model-list-logo-invert' : ''}`}
                src={getProviderLogoUrl(selectedModel.id)}
                alt=""
                width={14}
                height={14}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <span>{selectedModel ? selectedModel.name : 'Select model'}</span>
            <ChevronDown size={12} />
          </button>

          {modelOpen && (
            <div className="write-ai-model-dropdown">
              <div className="write-ai-model-search-wrap">
                <Search size={12} />
                <input
                  ref={modelSearchRef}
                  className="write-ai-model-search"
                  placeholder="Search…"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="write-ai-model-list">
                {filteredModels.length === 0 && (
                  <p className="write-ai-model-empty">No models found</p>
                )}
                {filteredModels.map((m) => (
                  <button
                    key={m.id}
                    className={`write-ai-model-item${selectedModel?.id === m.id ? ' write-ai-model-item-active' : ''}`}
                    type="button"
                    onClick={() => {
                      if (collabMode) {
                        addCollabModel(m)
                      } else {
                        setSelectedModel(m)
                      }
                      setModelOpen(false)
                      setModelSearch('')
                    }}
                  >
                    <img
                      className={`write-ai-model-item-logo${providerNeedsInvert(m.id) ? ' model-list-logo-invert' : ''}`}
                      src={getProviderLogoUrl(m.id)}
                      alt=""
                      width={16}
                      height={16}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                    <span className="write-ai-model-item-name">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {collabMode && (
        <div className="write-ai-collab-bar">
          {collabModels.length === 0 ? (
            <span className="write-ai-collab-hint">Select 2+ models to collaborate</span>
          ) : (
            collabModels.map((m) => (
              <span key={m.id} className="write-ai-collab-chip">
                <img
                  className={`write-ai-collab-chip-logo${providerNeedsInvert(m.id) ? ' model-list-logo-invert' : ''}`}
                  src={getProviderLogoUrl(m.id)}
                  alt=""
                  width={12}
                  height={12}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                {m.name.split(':').pop()?.trim() || m.name}
                <button type="button" onClick={() => removeCollabModel(m.id)} className="write-ai-collab-chip-x">×</button>
              </span>
            ))
          )}
          {collabModels.length >= 2 && (
            <select
              className="write-ai-collab-rounds"
              value={collabRounds}
              onChange={(e) => setCollabRounds(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} round{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="write-ai-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="write-ai-empty">
            <p>{collabMode ? 'Select models above, then ask a question — each model will take turns responding about your document.' : 'Ask the AI to help with your document — draft sections, fix errors, generate equations, or improve structure.'}</p>
          </div>
        )}

        {messages.map((msg) => {
          const hasReasoning = Boolean(msg.reasoning?.trim())
          const isExpanded = expandedThinking.has(msg.id)

          return (
            <div key={msg.id} className={`write-ai-msg write-ai-msg-${msg.role}`}>
              {msg.role === 'assistant' && msg.modelName && (
                <span className="write-ai-msg-model-label">{msg.modelName}</span>
              )}
              {msg.role === 'assistant' && hasReasoning && (
                <button
                  className="write-ai-thinking-toggle"
                  type="button"
                  onClick={() => toggleThinking(msg.id)}
                  aria-expanded={isExpanded}
                >
                  {msg.streaming && !msg.content && !msg.reasoning ? (
                    <span className="write-ai-thinking-pulse">Thinking…</span>
                  ) : msg.thinkingDuration != null ? (
                    <span>Thought for {Math.round(msg.thinkingDuration / 1000)}s</span>
                  ) : (
                    <span>Thoughts</span>
                  )}
                </button>
              )}

              {msg.role === 'assistant' && hasReasoning && isExpanded && (
                <div className="write-ai-thinking-content">
                  <MarkdownBlock>{msg.reasoning ?? ''}</MarkdownBlock>
                </div>
              )}

              {msg.role === 'assistant' && msg.streaming && !msg.content && !msg.reasoning && (
                <div className="write-ai-thinking-pulse">
                  <Loader size={14} className="write-ai-spinner" />
                  Thinking…
                </div>
              )}

              {msg.content && (
                <div className={`write-ai-msg-content${msg.error ? ' write-ai-msg-error' : ''}`}>
                  {msg.role === 'assistant' ? (
                    <div className="write-ai-markdown">
                      <ReactMarkdown
                        components={{
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          pre: ({ node, children: _children }: any) => {
                            const codeNode = node?.children?.[0]
                            const classNames: string[] = (codeNode?.properties?.className as string[]) ?? []
                            const langId = classNames.find((c: string) => c.startsWith('language-'))?.replace('language-', '') ?? ''
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const rawCode: string = (codeNode?.children?.[0] as any)?.value ?? ''
                            return (
                              <WriteAiCodeBlock
                                code={rawCode}
                                lang={langId}
                                onApply={onApplyEdit}
                              />
                            )
                          },
                          code: ({ children, className, ...props }) => (
                            <code className={className || 'write-ai-inline-code'} {...props}>{children}</code>
                          ),
                        }}
                        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
                        remarkPlugins={[remarkGfm, remarkMath]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="write-ai-input-area">
        <textarea
          ref={inputRef}
          className="write-ai-input"
          placeholder={collabMode ? (collabModels.length >= 2 ? 'Ask your models to collaborate…' : 'Add 2+ models above…') : (selectedModel ? 'Ask about your document…' : 'Select a model first…')}
          value={prompt}
          rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={collabMode ? collabModels.length < 2 : !selectedModel}
          spellCheck={false}
        />
        <button
          className={`write-ai-send${streaming ? ' write-ai-send-stop' : prompt.trim() ? ' write-ai-send-active' : ''}`}
          type="button"
          disabled={!streaming && (!prompt.trim() || (collabMode ? collabModels.length < 2 : !selectedModel))}
          onClick={streaming ? stopStream : handleSubmit}
        >
          {streaming ? <Square size={12} fill="currentColor" /> : <ArrowUp size={16} />}
        </button>
      </div>
    </div>
  )
}
