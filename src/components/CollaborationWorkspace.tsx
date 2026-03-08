// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Paperclip, Mic, ChevronDown, Search, X } from 'lucide-react'
import { fetchOpenRouterModels, type OpenRouterModel } from '../lib/openrouter'

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

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // fetch models once, no auto-select
  useEffect(() => {
    fetchOpenRouterModels().then((list) => {
      setModels(list)
    }).catch(() => {/* ignore */})
  }, [])

  // close dropdown on outside click
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

  // focus search when dropdown opens
  useEffect(() => {
    if (modelOpen) setTimeout(() => modelSearchRef.current?.focus(), 40)
  }, [modelOpen])

  // speech recognition
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
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
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
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      rec.start()
      setListening(true)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: file.name,
            dataUrl: reader.result as string,
            mimeType: file.type,
          },
        ])
      }
      reader.readAsDataURL(file)
    })
    // reset so same file can be re-attached
    e.target.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const supportsFiles = selectedModel ? isMultimodal(selectedModel) : false

  const filteredModels = modelSearch.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : models

  return (
    <div className="prompt-page">
      <div className="prompt-center">
        <div className="prompt-box">
          {/* Attachment preview strip */}
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
              {/* Hidden file input */}
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

              {/* Model selector */}
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
                        <button
                          key={m.id}
                          className={`model-list-item${selectedModel?.id === m.id ? ' model-list-item-active' : ''}`}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m)
                            setModelOpen(false)
                            setModelSearch('')
                            // clear attachments if new model doesn't support files
                            if (!isMultimodal(m)) setAttachments([])
                          }}
                        >
                          <span className="model-list-name">{m.name}</span>
                          <span className="model-list-id">{m.id}</span>
                        </button>
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
  )
}
