// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Paperclip, Mic, ChevronDown, Search } from 'lucide-react'
import { fetchOpenRouterModels, type OpenRouterModel } from '../lib/openrouter'

interface CollaborationWorkspaceProps {
  currentUser: User
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any
  }
}

export function CollaborationWorkspace(_props: CollaborationWorkspaceProps) {
  const [prompt, setPrompt] = useState('')
  const [listening, setListening] = useState(false)

  // model selector
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel | null>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const modelSearchRef = useRef<HTMLInputElement>(null)
  const modelDropRef = useRef<HTMLDivElement>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // fetch models once
  useEffect(() => {
    fetchOpenRouterModels().then((list) => {
      setModels(list)
      if (list.length > 0) setSelectedModel(list[0])
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
              <button className="prompt-pill-btn" type="button">
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
                    {selectedModel ? selectedModel.name : 'Select model'}
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
              {/* Bare mic icon */}
              <button
                className={`prompt-mic${listening ? ' prompt-mic-active' : ''}`}
                type="button"
                onClick={toggleVoice}
                aria-label={listening ? 'Stop recording' : 'Start voice input'}
              >
                <Mic size={18} />
              </button>

              <button
                className={`prompt-submit${prompt.trim() ? ' prompt-submit-active' : ''}`}
                type="button"
                disabled={!prompt.trim()}
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
