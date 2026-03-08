// CollaborationWorkspace commented out for redesign
import { useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Paperclip, Mic } from 'lucide-react'

interface CollaborationWorkspaceProps {
  currentUser: User
}

export function CollaborationWorkspace(_props: CollaborationWorkspaceProps) {
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
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
        <h2 className="prompt-heading">What do you want to argue?</h2>
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
              <button className="prompt-pill-btn" type="button">
                <Mic size={16} />
                <span>Voice</span>
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
