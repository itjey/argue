// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Paperclip, Mic, MicOff } from 'lucide-react'

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<unknown>(null)

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

  function handleInput() {
    autoResize()
  }

  function toggleVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = recognitionRef.current as any
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
      // submit handler placeholder
    }
  }

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
            onChange={(e) => { setPrompt(e.target.value); handleInput() }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          <div className="prompt-actions">
            <div className="prompt-actions-left">
              <button className="prompt-pill-btn" type="button">
                <Paperclip size={16} />
                <span>Attach</span>
              </button>
              <button
                className={`prompt-pill-btn${listening ? ' prompt-pill-btn-active' : ''}`}
                type="button"
                onClick={toggleVoice}
                title={listening ? 'Stop recording' : 'Start voice input'}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{listening ? 'Stop' : 'Voice'}</span>
              </button>
            </div>
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
  )
}
