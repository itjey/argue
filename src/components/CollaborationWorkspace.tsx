// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Paperclip, Mic, ChevronDown, Search, X, Info } from 'lucide-react'
import { fetchOpenRouterModels, type OpenRouterModel } from '../lib/openrouter'
import {
  fetchOpenRouterStatsSnapshot,
  resolveOpenRouterModelStats,
  type OpenRouterStatsSnapshot,
  type OpenRouterModelStatsEntry,
} from '../lib/openrouterStats'
import { ModelStatsPanel } from './ModelStatsPanel'

interface CollaborationWorkspaceProps {
  currentUser: User
}

interface AttachedFile {
  id: string
  name: string
  dataUrl: string
  mimeType: string
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

export function CollaborationWorkspace(_props: CollaborationWorkspaceProps) {
  const [prompt, setPrompt] = useState('')
  const [listening, setListening] = useState(false)
  const [attachments, setAttachments] = useState<AttachedFile[]>([])

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    fetchOpenRouterModels().then((list) => setModels(list)).catch(() => {})
  }, [])

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
    if (e.key === 'Enter' && !e.shiftKey) e.preventDefault()
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

  const supportsFiles = selectedModel ? isMultimodal(selectedModel) : false

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

      <div className="prompt-page">
        <div className="prompt-center">
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
              placeholder="Ask anything…"
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
                  disabled={!prompt.trim() && attachments.length === 0}
                  aria-label="Submit"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
