import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { User } from 'firebase/auth'
import {
  Bot,
  KeyRound,
  LibraryBig,
  LoaderCircle,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  createOpenRouterChatCompletion,
  fetchOpenRouterModels,
  formatModelDate,
  formatOpenRouterPrice,
  getRecentOpenRouterModels,
  type OpenRouterChatMessage,
  type OpenRouterModel,
} from '../lib/openrouter'

type ChatWorkspaceProps = {
  currentUser: User
  isVerified: boolean
  onOpenAccount: () => void
}

type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const OPENROUTER_KEY_STORAGE = 'argue-openrouter-api-key'
const OPENROUTER_MODEL_STORAGE = 'argue-openrouter-model'

const promptSuggestions = [
  'Explain the core tradeoffs in using multiple models together.',
  'Help me debug a React component that rerenders too often.',
  'Design a schema for storing collaborative AI conversations.',
  'Summarize the newest OpenRouter models worth testing first.',
]

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatLargeNumber(value?: number) {
  if (!value) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function ChatWorkspace({
  currentUser,
  isVerified,
  onOpenAccount,
}: ChatWorkspaceProps) {
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const [draftApiKey, setDraftApiKey] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState(
    'Stored locally in this browser only.',
  )
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [draftMessage, setDraftMessage] = useState('')
  const [chatError, setChatError] = useState('')
  const [chatStatus, setChatStatus] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    const storedModel =
      window.localStorage.getItem(OPENROUTER_MODEL_STORAGE) ?? ''

    setDraftApiKey(storedKey)
    setSavedApiKey(storedKey)
    setSelectedModelId(storedModel)
  }, [])

  useEffect(() => {
    void loadModels()
  }, [])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [isSending, messages])

  async function loadModels() {
    setModelsLoading(true)
    setModelsError('')

    try {
      const nextModels = await fetchOpenRouterModels()
      const storedModel =
        window.localStorage.getItem(OPENROUTER_MODEL_STORAGE) ?? ''

      setModels(nextModels)

      if (storedModel && nextModels.some((model) => model.id === storedModel)) {
        setSelectedModelId(storedModel)
      } else {
        const newestModel = getRecentOpenRouterModels(nextModels, 1)[0]
        const fallbackModelId = newestModel?.id ?? nextModels[0]?.id ?? ''

        setSelectedModelId(fallbackModelId)

        if (fallbackModelId) {
          window.localStorage.setItem(OPENROUTER_MODEL_STORAGE, fallbackModelId)
        }
      }
    } catch (error) {
      setModelsError(
        error instanceof Error
          ? error.message
          : 'OpenRouter models could not be loaded.',
      )
    } finally {
      setModelsLoading(false)
    }
  }

  function handleSaveApiKey() {
    const trimmedKey = draftApiKey.trim()
    setSavedApiKey(trimmedKey)

    if (trimmedKey) {
      window.localStorage.setItem(OPENROUTER_KEY_STORAGE, trimmedKey)
      setKeyStatus('OpenRouter key saved locally in this browser.')
      return
    }

    window.localStorage.removeItem(OPENROUTER_KEY_STORAGE)
    setKeyStatus('OpenRouter key cleared from this browser.')
  }

  function handleClearApiKey() {
    setDraftApiKey('')
    setSavedApiKey('')
    setKeyStatus('OpenRouter key cleared from this browser.')
    window.localStorage.removeItem(OPENROUTER_KEY_STORAGE)
  }

  function handleSelectModel(modelId: string) {
    setSelectedModelId(modelId)
    setChatError('')
    window.localStorage.setItem(OPENROUTER_MODEL_STORAGE, modelId)
  }

  function handlePromptSuggestion(prompt: string) {
    setDraftMessage(prompt)
  }

  async function handleSendMessage() {
    const trimmedMessage = draftMessage.trim()

    if (!savedApiKey) {
      setChatError('Add and save an OpenRouter API key before chatting.')
      return
    }

    if (!selectedModelId) {
      setChatError('Pick a model from the OpenRouter library first.')
      return
    }

    if (!trimmedMessage) {
      return
    }

    const nextMessages: WorkspaceMessage[] = [
      ...messages,
      {
        id: createId(),
        role: 'user',
        content: trimmedMessage,
      },
    ]

    setMessages(nextMessages)
    setDraftMessage('')
    setChatError('')
    setChatStatus('')
    setIsSending(true)

    try {
      const openRouterMessages: OpenRouterChatMessage[] = nextMessages.map(
        (message) => ({
          role: message.role,
          content: message.content,
        }),
      )

      const assistantReply = await createOpenRouterChatCompletion({
        apiKey: savedApiKey,
        messages: openRouterMessages,
        model: selectedModelId,
      })

      setMessages([
        ...nextMessages,
        {
          id: createId(),
          role: 'assistant',
          content: assistantReply,
        },
      ])
      setChatStatus('Response returned from OpenRouter.')
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : 'The chat request failed.',
      )
    } finally {
      setIsSending(false)
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      if (!isSending) {
        void handleSendMessage()
      }
    }
  }

  function handleClearThread() {
    setMessages([])
    setChatError('')
    setChatStatus('Started a new thread.')
  }

  const recentModels = getRecentOpenRouterModels(models, 8)
  const filteredModels = models.filter((model) => {
    if (!modelSearch.trim()) {
      return true
    }

    const searchableText = `${model.name} ${model.id} ${model.description}`.toLowerCase()
    return searchableText.includes(modelSearch.trim().toLowerCase())
  })

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? recentModels[0] ?? null
  const catalogCountLabel = modelsLoading
    ? 'Refreshing the live OpenRouter catalog.'
    : `${models.length} models are available from the current OpenRouter index.`

  return (
    <section className="workspace-home section" id="chat">
      <div className="workspace-home-header">
        <div>
          <p className="section-kicker">Workspace</p>
          <h1>Connect OpenRouter, choose any live model, and start chatting.</h1>
          <p className="workspace-home-copy">
            The model library below is loaded from OpenRouter's current catalog at
            runtime, so the workspace reflects newly released models instead of a
            stale hardcoded list.
          </p>
        </div>

        <div className="workspace-account-card" id="account">
          <div className="workspace-account-header">
            <div>
              <p className="panel-label">Signed in</p>
              <h2>{currentUser.email ?? 'Argue account'}</h2>
            </div>
            <div className="status-pill">
              {isVerified ? <ShieldCheck size={16} /> : <KeyRound size={16} />}
              {isVerified ? 'Verified' : 'Verification pending'}
            </div>
          </div>
          <p className="workspace-account-copy">
            Your Firebase login controls access to the workspace. Your OpenRouter
            API key stays local to this browser unless you choose to paste it again elsewhere.
          </p>
          <button className="button button-secondary" onClick={onOpenAccount} type="button">
            Manage account
          </button>
        </div>
      </div>

      <div className="workspace-home-grid">
        <aside className="workspace-library-column" id="models">
          <div className="control-card">
            <div className="control-card-header">
              <div>
                <p className="panel-label">OpenRouter key</p>
                <h3>Attach your API access</h3>
              </div>
              <KeyRound size={18} />
            </div>

            <div className="workspace-form-stack">
              <label className="auth-field">
                <span>API key</span>
                <input
                  autoComplete="off"
                  className="auth-input"
                  onChange={(event) => setDraftApiKey(event.target.value)}
                  placeholder="sk-or-v1-..."
                  spellCheck={false}
                  type="password"
                  value={draftApiKey}
                />
              </label>
            </div>

            <div className="workspace-inline-actions">
              <button className="button button-primary" onClick={handleSaveApiKey} type="button">
                Save key
              </button>
              <button
                className="button button-secondary"
                onClick={handleClearApiKey}
                type="button"
              >
                Clear
              </button>
            </div>

            <p className="workspace-inline-note">{keyStatus}</p>
          </div>

          <div className="control-card">
            <div className="control-card-header">
              <div>
                <p className="panel-label">Newest on OpenRouter</p>
                <h3>Recent models worth testing first</h3>
              </div>
              <Sparkles size={18} />
            </div>

            <div className="workspace-model-spotlight-grid">
              {recentModels.map((model) => (
                <button
                  className={`workspace-model-card ${
                    selectedModelId === model.id ? 'workspace-model-card-active' : ''
                  }`}
                  key={model.id}
                  onClick={() => handleSelectModel(model.id)}
                  type="button"
                >
                  <div className="workspace-model-card-top">
                    <strong>{model.name}</strong>
                    <span>{formatModelDate(model.created)}</span>
                  </div>
                  <p>{model.id}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="control-card">
            <div className="control-card-header">
              <div>
                <p className="panel-label">Model library</p>
                <h3>All current OpenRouter models</h3>
              </div>
              <LibraryBig size={18} />
            </div>

            <label className="workspace-search-field">
              <Search size={16} />
              <input
                className="auth-input"
                onChange={(event) => setModelSearch(event.target.value)}
                placeholder={`Search ${models.length || 0} models`}
                type="search"
                value={modelSearch}
              />
            </label>

            <div className="workspace-inline-actions">
              <button
                className="button button-secondary"
                disabled={modelsLoading}
                onClick={() => void loadModels()}
                type="button"
              >
                {modelsLoading ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <RefreshCcw size={16} />
                )}
                Refresh catalog
              </button>
            </div>

            <p className="workspace-inline-note">{catalogCountLabel}</p>
            {modelsError ? <p className="workspace-error">{modelsError}</p> : null}

            <div className="workspace-library-list">
              {modelsLoading && models.length === 0 ? (
                <div className="workspace-library-empty">
                  <LoaderCircle className="spin" size={16} />
                  <span>Loading the current OpenRouter model index.</span>
                </div>
              ) : null}

              {!modelsLoading && filteredModels.length === 0 ? (
                <div className="workspace-library-empty">
                  <Search size={16} />
                  <span>No models match the current search.</span>
                </div>
              ) : null}

              {filteredModels.map((model) => (
                <button
                  className={`workspace-library-item ${
                    selectedModelId === model.id ? 'workspace-library-item-active' : ''
                  }`}
                  key={model.id}
                  onClick={() => handleSelectModel(model.id)}
                  type="button"
                >
                  <div>
                    <strong>{model.name}</strong>
                    <p>{model.id}</p>
                  </div>
                  <span>{formatLargeNumber(model.context_length)} ctx</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="workspace-chat-column">
          <div className="control-card workspace-selected-model-card">
            <div className="control-card-header">
              <div>
                <p className="panel-label">Selected model</p>
                <h3>{selectedModel?.name ?? 'Choose a model'}</h3>
              </div>
              <Bot size={18} />
            </div>

            {selectedModel ? (
              <>
                <p className="workspace-selected-model-copy">
                  {selectedModel.description}
                </p>
                <div className="workspace-model-meta-grid">
                  <div className="workspace-model-meta">
                    <span>Model id</span>
                    <strong>{selectedModel.id}</strong>
                  </div>
                  <div className="workspace-model-meta">
                    <span>Prompt pricing</span>
                    <strong>{formatOpenRouterPrice(selectedModel.pricing?.prompt)}</strong>
                  </div>
                  <div className="workspace-model-meta">
                    <span>Completion pricing</span>
                    <strong>
                      {formatOpenRouterPrice(selectedModel.pricing?.completion)}
                    </strong>
                  </div>
                  <div className="workspace-model-meta">
                    <span>Context window</span>
                    <strong>{formatLargeNumber(selectedModel.context_length)}</strong>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="control-card workspace-chat-card">
            <div className="workspace-chat-header">
              <div>
                <p className="panel-label">Chat</p>
                <h3>Direct conversation with the model you selected</h3>
              </div>
              <button className="button button-secondary" onClick={handleClearThread} type="button">
                <Trash2 size={16} />
                New thread
              </button>
            </div>

            {chatStatus ? <p className="workspace-status">{chatStatus}</p> : null}
            {chatError ? <p className="workspace-error">{chatError}</p> : null}

            <div className="workspace-message-stack">
              {messages.length === 0 ? (
                <div className="workspace-empty-state">
                  <Bot size={20} />
                  <div>
                    <h4>Start with one of these prompts.</h4>
                    <p>
                      Save your OpenRouter key, choose a model, and send a message.
                    </p>
                  </div>
                </div>
              ) : null}

              {messages.map((message) => (
                <article
                  className={`workspace-message workspace-message-${message.role}`}
                  key={message.id}
                >
                  <div className="workspace-message-meta">
                    <strong>{message.role === 'user' ? 'You' : 'Model'}</strong>
                    <span>
                      {message.role === 'assistant'
                        ? selectedModel?.name ?? 'Assistant'
                        : currentUser.email ?? 'User'}
                    </span>
                  </div>
                  <p>{message.content}</p>
                </article>
              ))}

              {isSending ? (
                <div className="workspace-message workspace-message-assistant">
                  <div className="workspace-message-meta">
                    <strong>Model</strong>
                    <span>{selectedModel?.name ?? 'OpenRouter'}</span>
                  </div>
                  <p className="workspace-loading-line">
                    <LoaderCircle className="spin" size={16} />
                    Thinking...
                  </p>
                </div>
              ) : null}

              <div ref={messageEndRef} />
            </div>

            <div className="workspace-suggestion-row">
              {promptSuggestions.map((prompt) => (
                <button
                  className="workspace-suggestion-chip"
                  key={prompt}
                  onClick={() => handlePromptSuggestion(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="workspace-composer">
              <textarea
                className="workspace-textarea"
                onChange={(event) => setDraftMessage(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask the selected model anything..."
                spellCheck={false}
                value={draftMessage}
              />
              <button
                className="button button-primary"
                disabled={isSending || !draftMessage.trim()}
                onClick={() => void handleSendMessage()}
                type="button"
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export { ChatWorkspace }
