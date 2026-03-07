import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import type { User } from 'firebase/auth'
import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  Code2,
  FileText,
  Film,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  createOpenRouterChatCompletion,
  createOpenRouterChatCompletionStream,
  fetchOpenRouterModels,
  type OpenRouterChatContentPart,
  type OpenRouterChatMessage,
  type OpenRouterModel,
  type OpenRouterOutputModality,
  type OpenRouterReasoningEffort,
  type OpenRouterReasoningDetail,
  type OpenRouterUsage,
} from '../lib/openrouter'
import {
  getModelCapabilityProfile,
  looksLikeImageGenerationPrompt,
  type OpenRouterModelCapabilityProfile,
} from '../lib/openrouterCapabilities'
import {
  fetchOpenRouterStatsSnapshot,
  resolveOpenRouterModelStats,
  type OpenRouterStatsSnapshot,
} from '../lib/openrouterStats'
import {
  RichMessageContent,
  type RichMessageAttachment,
  type RichMessageAudio,
} from './RichMessageContent'

type ChatWorkspaceProps = {
  currentUser: User
}

type WorkspaceAttachment = RichMessageAttachment & {
  contentPart?: OpenRouterChatContentPart
  inlineText?: string
}

type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  isStreaming?: boolean
  modelId?: string
  modelName?: string
  text: string
  images: string[]
  audio: RichMessageAudio | null
  reasoning: string
  reasoningDetails: OpenRouterReasoningDetail[]
  refusal: string
  usage?: OpenRouterUsage | null
  estimatedCost?: number | null
  attachments: WorkspaceAttachment[]
  request: OpenRouterChatMessage
}

type ResponseMode = 'auto' | 'text' | 'text-image'

const OPENROUTER_KEY_STORAGE = 'argue-openrouter-api-key'
const OPENROUTER_MODEL_STORAGE = 'argue-openrouter-model'
const CODE_FILE_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.md',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])
const CODE_FILE_ACCEPT = [...CODE_FILE_EXTENSIONS].join(',')

const responseModeOptions: Array<{
  id: ResponseMode
  label: string
  description: string
}> = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Switches into image output when the prompt clearly asks for an image.',
  },
  {
    id: 'text',
    label: 'Text only',
    description: 'Useful when the model can also generate images but you only want text.',
  },
  {
    id: 'text-image',
    label: 'Text + image',
    description: 'Always request both a written response and image output when available.',
  },
]

const reasoningEffortOptions: Array<{
  id: OpenRouterReasoningEffort
  label: string
}> = [
  { id: 'none', label: 'Off' },
  { id: 'low', label: 'Light' },
  { id: 'medium', label: 'Balanced' },
  { id: 'high', label: 'Deep' },
]

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseOpenRouterPrice(value?: string) {
  if (!value) {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function estimateUsageCost(
  usage:
    | {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    | null
    | undefined,
  pricing?: {
    prompt?: string
    completion?: string
  },
) {
  if (!usage) {
    return null
  }

  const promptPrice = parseOpenRouterPrice(pricing?.prompt)
  const completionPrice = parseOpenRouterPrice(pricing?.completion)

  if (promptPrice == null && completionPrice == null) {
    return null
  }

  const promptCost = (usage.prompt_tokens ?? 0) * (promptPrice ?? 0)
  const completionCost = (usage.completion_tokens ?? 0) * (completionPrice ?? 0)
  const totalCost = promptCost + completionCost

  return Number.isFinite(totalCost) ? totalCost : null
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const decimals = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(decimals)} ${units[unitIndex]}`
}

function getFileExtension(name: string) {
  const lastDotIndex = name.lastIndexOf('.')
  return lastDotIndex >= 0 ? name.slice(lastDotIndex).toLowerCase() : ''
}

function isCodeOrTextFile(file: File) {
  return (
    file.type.startsWith('text/') || CODE_FILE_EXTENSIONS.has(getFileExtension(file.name))
  )
}

function getCodeFenceLanguage(name: string) {
  const extension = getFileExtension(name)

  switch (extension) {
    case '.js':
    case '.jsx':
      return 'javascript'
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.py':
      return 'python'
    case '.md':
      return 'markdown'
    case '.json':
      return 'json'
    case '.html':
      return 'html'
    case '.css':
    case '.scss':
      return 'css'
    case '.sh':
      return 'bash'
    case '.sql':
      return 'sql'
    case '.yaml':
    case '.yml':
      return 'yaml'
    case '.xml':
      return 'xml'
    default:
      return ''
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error(`The file ${file.name} could not be read.`))
    }

    reader.onerror = () => reject(new Error(`The file ${file.name} could not be read.`))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error(`The file ${file.name} could not be read as text.`))
    }

    reader.onerror = () =>
      reject(new Error(`The file ${file.name} could not be read as text.`))
    reader.readAsText(file)
  })
}

function dataUrlToBase64(dataUrl: string) {
  const [, base64Payload = ''] = dataUrl.split(',', 2)
  return base64Payload
}

function inferAudioFormat(file: File) {
  const extension = getFileExtension(file.name).replace('.', '')

  if (extension) {
    return extension
  }

  const mimeSubtype = file.type.split('/')[1]?.trim()
  return mimeSubtype || 'wav'
}

function buildTextFilePrompt(fileName: string, content: string) {
  const language = getCodeFenceLanguage(fileName)
  const normalizedContent = content.trimEnd()

  return `Attached file: ${fileName}\n\`\`\`${language}\n${normalizedContent}\n\`\`\``
}

function getAttachmentAccept(profile: OpenRouterModelCapabilityProfile | null) {
  const acceptedTypes = [CODE_FILE_ACCEPT]

  if (profile?.canInputImage) {
    acceptedTypes.push('image/*')
  }

  if (profile?.canInputFile) {
    acceptedTypes.push('application/pdf')
  }

  if (profile?.canInputAudio) {
    acceptedTypes.push('audio/*')
  }

  if (profile?.canInputVideo) {
    acceptedTypes.push('video/*')
  }

  return acceptedTypes.join(',')
}

async function createAttachmentFromFile(
  file: File,
  profile: OpenRouterModelCapabilityProfile,
) {
  const attachmentId = createId()

  if (file.type.startsWith('image/') && profile.canInputImage) {
    const dataUrl = await readFileAsDataUrl(file)

    return {
      id: attachmentId,
      kind: 'image',
      name: file.name,
      previewUrl: dataUrl,
      summary: `${formatBytes(file.size)} image input`,
      contentPart: {
        type: 'image_url',
        image_url: {
          url: dataUrl,
          detail: 'auto',
        },
      },
    } satisfies WorkspaceAttachment
  }

  if (
    (file.type === 'application/pdf' || getFileExtension(file.name) === '.pdf') &&
    profile.canInputFile
  ) {
    const dataUrl = await readFileAsDataUrl(file)

    return {
      id: attachmentId,
      kind: 'pdf',
      name: file.name,
      summary: `${formatBytes(file.size)} PDF input`,
      contentPart: {
        type: 'file',
        file: {
          file_data: dataUrl,
          filename: file.name,
        },
      },
    } satisfies WorkspaceAttachment
  }

  if (file.type.startsWith('audio/') && profile.canInputAudio) {
    const dataUrl = await readFileAsDataUrl(file)

    return {
      id: attachmentId,
      kind: 'audio',
      name: file.name,
      summary: `${formatBytes(file.size)} audio input`,
      contentPart: {
        type: 'input_audio',
        input_audio: {
          data: dataUrlToBase64(dataUrl),
          format: inferAudioFormat(file),
        },
      },
    } satisfies WorkspaceAttachment
  }

  if (file.type.startsWith('video/') && profile.canInputVideo) {
    const dataUrl = await readFileAsDataUrl(file)

    return {
      id: attachmentId,
      kind: 'video',
      name: file.name,
      summary: `${formatBytes(file.size)} video input`,
      contentPart: {
        type: 'video_url',
        video_url: {
          url: dataUrl,
        },
      },
    } satisfies WorkspaceAttachment
  }

  if (isCodeOrTextFile(file) && profile.canInputText) {
    const textContent = await readFileAsText(file)

    return {
      id: attachmentId,
      kind: 'code',
      name: file.name,
      summary: `${formatBytes(file.size)} code or text input`,
      inlineText: buildTextFilePrompt(file.name, textContent),
    } satisfies WorkspaceAttachment
  }

  throw new Error(
    `${file.name} is not supported by the selected model. Pick a model that advertises the right input modality or upload a code/text file instead.`,
  )
}

function buildMessageContent(
  message: string,
  attachments: WorkspaceAttachment[],
): string | OpenRouterChatContentPart[] {
  const trimmedMessage = message.trim()
  const parts: OpenRouterChatContentPart[] = []

  if (trimmedMessage) {
    parts.push({
      type: 'text',
      text: trimmedMessage,
    })
  }

  for (const attachment of attachments) {
    if (attachment.inlineText) {
      parts.push({
        type: 'text',
        text: attachment.inlineText,
      })
    }

    if (attachment.contentPart) {
      parts.push(attachment.contentPart)
    }
  }

  if (parts.length === 1 && parts[0]?.type === 'text') {
    return parts[0].text
  }

  return parts
}

function getRequestedModalities(
  message: string,
  profile: OpenRouterModelCapabilityProfile | null,
  responseMode: ResponseMode,
): OpenRouterOutputModality[] | undefined {
  if (!profile?.canOutputImage) {
    return undefined
  }

  const supportedOutputs = new Set<OpenRouterOutputModality>(profile.outputModalities)
  const imageAndTextOutputs: OpenRouterOutputModality[] = ['text', 'image']

  if (responseMode === 'text-image') {
    return imageAndTextOutputs.filter((value): value is OpenRouterOutputModality =>
      supportedOutputs.has(value),
    )
  }

  if (responseMode === 'text') {
    return supportedOutputs.has('text') ? ['text'] : undefined
  }

  if (looksLikeImageGenerationPrompt(message)) {
    return imageAndTextOutputs.filter((value): value is OpenRouterOutputModality =>
      supportedOutputs.has(value),
    )
  }

  return supportedOutputs.has('text') ? ['text'] : undefined
}

function getReasoningRequest(
  profile: OpenRouterModelCapabilityProfile | null,
  reasoningEffort: OpenRouterReasoningEffort,
) {
  if (!profile?.supportsReasoning || reasoningEffort === 'none') {
    return undefined
  }

  return {
    effort: reasoningEffort,
    summary: 'detailed' as const,
  }
}

function shouldIncludeReasoning(
  profile: OpenRouterModelCapabilityProfile | null,
  reasoningEffort: OpenRouterReasoningEffort,
) {
  return Boolean(profile?.supportsReasoning && reasoningEffort !== 'none')
}

function shouldStreamAssistantResponse(
  modalities: OpenRouterOutputModality[] | undefined,
) {
  if (!modalities || modalities.length === 0) {
    return true
  }

  return !modalities.includes('image') && !modalities.includes('audio')
}

function getAudioPayload(data: { data?: string; transcript?: string } | null) {
  if (!data) {
    return null
  }

  return {
    src: data.data ? `data:audio/wav;base64,${data.data}` : null,
    transcript: data.transcript?.trim() ?? null,
  } satisfies RichMessageAudio
}

function buildAssistantRequestFromReply(assistantReply: {
  audio: { data?: string; transcript?: string } | null
  contentParts: OpenRouterChatContentPart[]
  images: string[]
  phase: string | null
  reasoning: string
  reasoningDetails: OpenRouterReasoningDetail[]
  text: string
}) {
  const assistantImages = assistantReply.images.map((imageUrl) => ({
    image_url: {
      url: imageUrl,
    },
  }))

  return {
    role: 'assistant',
    content:
      assistantReply.contentParts.length > 0
        ? assistantReply.contentParts
        : assistantReply.text || null,
    reasoning: assistantReply.reasoning || undefined,
    reasoning_details:
      assistantReply.reasoningDetails.length > 0
        ? assistantReply.reasoningDetails
        : undefined,
    images: assistantImages.length > 0 ? assistantImages : undefined,
    audio: assistantReply.audio ?? undefined,
    phase: assistantReply.phase,
  } satisfies OpenRouterChatMessage
}

function ChatWorkspace({ currentUser }: ChatWorkspaceProps) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messageStackRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoScrollRef = useRef(true)
  const [savedApiKey, setSavedApiKey] = useState('')
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [statsSnapshot, setStatsSnapshot] = useState<OpenRouterStatsSnapshot | null>(
    null,
  )
  const [, setStatsLoading] = useState(true)
  const [, setStatsError] = useState('')
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [draftMessage, setDraftMessage] = useState('')
  const [attachments, setAttachments] = useState<WorkspaceAttachment[]>([])
  const [responseMode, setResponseMode] = useState<ResponseMode>('auto')
  const [reasoningEffort, setReasoningEffort] =
    useState<OpenRouterReasoningEffort>('medium')
  const [chatError, setChatError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const deferredModelSearch = useDeferredValue(modelSearch)

  useEffect(() => {
    const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    const storedModel =
      window.localStorage.getItem(OPENROUTER_MODEL_STORAGE) ?? ''

    setSavedApiKey(storedKey)
    setSelectedModelId(storedModel)
  }, [])

  useEffect(() => {
    const syncSavedKey = () => {
      const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
      setSavedApiKey(storedKey)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSavedKey()
      }
    }

    window.addEventListener('argue-openrouter-key-changed', syncSavedKey)
    window.addEventListener('focus', syncSavedKey)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('argue-openrouter-key-changed', syncSavedKey)
      window.removeEventListener('focus', syncSavedKey)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    void loadModels()
  }, [])

  useEffect(() => {
    void loadStatsSnapshot()
  }, [])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return
    }

    const container = messageStackRef.current

    if (!container) {
      return
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto',
    })
  }, [isSending, messages])

  function handleMessageStackScroll() {
    const container = messageStackRef.current

    if (!container) {
      return
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom <= 96
  }

  function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
    const baseHeight = 32
    textarea.style.height = `${baseHeight}px`
    textarea.style.height = `${Math.max(textarea.scrollHeight, baseHeight)}px`
  }

  function handleDraftMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraftMessage(event.target.value)
    resizeComposerTextarea(event.currentTarget)
  }

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
        const fallbackModelId = nextModels[0]?.id ?? ''

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

  async function loadStatsSnapshot() {
    setStatsLoading(true)
    setStatsError('')

    try {
      const snapshot = await fetchOpenRouterStatsSnapshot()
      setStatsSnapshot(snapshot)
    } catch (error) {
      setStatsError(
        error instanceof Error
          ? error.message
          : 'OpenRouter stats could not be loaded.',
      )
    } finally {
      setStatsLoading(false)
    }
  }

  function handleSelectModel(modelId: string) {
    setSelectedModelId(modelId)
    setChatError('')
    window.localStorage.setItem(OPENROUTER_MODEL_STORAGE, modelId)
  }

  function handleRemoveAttachment(attachmentId: string) {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  async function handleAttachmentSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (selectedFiles.length === 0) {
      return
    }

    if (!selectedModelProfile) {
      setChatError('Pick a model before attaching files.')
      return
    }

    const nextAttachments: WorkspaceAttachment[] = []

    for (const file of selectedFiles) {
      try {
        nextAttachments.push(await createAttachmentFromFile(file, selectedModelProfile))
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : 'One of the selected files could not be attached.',
        )
      }
    }

    if (nextAttachments.length > 0) {
      setAttachments((currentAttachments) => [
        ...currentAttachments,
        ...nextAttachments,
      ])
      setChatError('')
    }
  }

  async function handleSendMessage() {
    const trimmedMessage = draftMessage.trim()

    if (!savedApiKey) {
      setChatError('Add and save an OpenRouter API key before chatting.')
      return
    }

    if (!selectedModel || !selectedModelProfile) {
      setChatError('Pick a model from the OpenRouter library first.')
      return
    }

    if (!trimmedMessage && attachments.length === 0) {
      return
    }

    const nextUserAttachments = [...attachments]
    const userRequest = {
      role: 'user',
      content: buildMessageContent(trimmedMessage, nextUserAttachments),
    } satisfies OpenRouterChatMessage
    const activeModelSnapshot = {
      id: selectedModel.id,
      name: selectedModel.name,
      pricing: {
        prompt: selectedModel.pricing?.prompt,
        completion: selectedModel.pricing?.completion,
      },
    }
    const assistantMessageId = createId()
    const assistantPlaceholder = {
      id: assistantMessageId,
      role: 'assistant',
      isStreaming: true,
      modelId: activeModelSnapshot.id,
      modelName: activeModelSnapshot.name,
      text: '',
      images: [],
      audio: null,
      reasoning: '',
      reasoningDetails: [],
      refusal: '',
      usage: null,
      estimatedCost: null,
      attachments: [],
      request: {
        role: 'assistant',
        content: null,
      },
    } satisfies WorkspaceMessage
    const nextMessages: WorkspaceMessage[] = [
      ...messages,
      {
        id: createId(),
        role: 'user',
        text: trimmedMessage,
        images: [],
        audio: null,
        reasoning: '',
        reasoningDetails: [],
        refusal: '',
        attachments: nextUserAttachments,
        request: userRequest,
      },
      assistantPlaceholder,
    ]

    shouldAutoScrollRef.current = true
    setMessages(nextMessages)
    setDraftMessage('')
    const composerTextarea = composerTextareaRef.current

    if (composerTextarea) {
      composerTextarea.style.height = '32px'
    }
    setAttachments([])
    setChatError('')
    setIsSending(true)

    try {
      const requestedModalities = getRequestedModalities(
        trimmedMessage,
        selectedModelProfile,
        responseMode,
      )
      const requestOptions = {
        apiKey: savedApiKey,
        includeReasoning: shouldIncludeReasoning(
          selectedModelProfile,
          reasoningEffort,
        ),
        messages: nextMessages
          .filter((message) => !message.isStreaming)
          .map((message) => message.request),
        model: selectedModelId,
        modalities: requestedModalities,
        reasoning: getReasoningRequest(selectedModelProfile, reasoningEffort),
      }
      const assistantReply = shouldStreamAssistantResponse(requestedModalities)
        ? await createOpenRouterChatCompletionStream({
            ...requestOptions,
            onProgress: (partialReply) => {
              setMessages((currentMessages) =>
                currentMessages.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        text: partialReply.text,
                        images: partialReply.images,
                        audio: getAudioPayload(partialReply.audio),
                        reasoning: partialReply.reasoning,
                        reasoningDetails: partialReply.reasoningDetails,
                        refusal: partialReply.refusal,
                        usage: partialReply.usage,
                        estimatedCost: estimateUsageCost(
                          partialReply.usage,
                          activeModelSnapshot.pricing,
                        ),
                        request: buildAssistantRequestFromReply(partialReply),
                      }
                    : message,
                ),
              )
            },
          })
        : await createOpenRouterChatCompletion(requestOptions)

      const assistantMessage = {
        ...assistantPlaceholder,
        isStreaming: false,
        modelId: activeModelSnapshot.id,
        modelName: activeModelSnapshot.name,
        text: assistantReply.text,
        images: assistantReply.images,
        audio: getAudioPayload(assistantReply.audio),
        reasoning: assistantReply.reasoning,
        reasoningDetails: assistantReply.reasoningDetails,
        refusal: assistantReply.refusal,
        usage: assistantReply.usage,
        estimatedCost: estimateUsageCost(
          assistantReply.usage,
          activeModelSnapshot.pricing,
        ),
        request: buildAssistantRequestFromReply(assistantReply),
      } satisfies WorkspaceMessage

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId ? assistantMessage : message,
        ),
      )
    } catch (error) {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== assistantMessageId),
      )
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
    setAttachments([])
    setChatError('')
  }

  const filteredModels = models.filter((model) => {
    if (!deferredModelSearch.trim()) {
      return true
    }

    const searchableText = `${model.name} ${model.id} ${model.description}`.toLowerCase()
    return searchableText.includes(deferredModelSearch.trim().toLowerCase())
  })

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? models[0] ?? null
  const selectedModelStats = resolveOpenRouterModelStats(statsSnapshot, selectedModel)
  const selectedModelProfile = selectedModel
    ? getModelCapabilityProfile(selectedModel, selectedModelStats)
    : null
  const attachmentAccept = getAttachmentAccept(selectedModelProfile)
  const hasSavedApiKey = savedApiKey.trim().length > 0
  const canOutputImage = Boolean(selectedModelProfile?.canOutputImage)
  const supportsReasoning = Boolean(selectedModelProfile?.supportsReasoning)
  const accountEmail = currentUser.email ?? 'Signed in user'

  useEffect(() => {
    if (!supportsReasoning && reasoningEffort !== 'none') {
      setReasoningEffort('none')
    }
  }, [reasoningEffort, supportsReasoning])

  return (
    <section className="workspace-home section" id="chat">
      <div className="workspace-chat-shell">
        <div className="workspace-utility-grid" id="models">
          <details className="workspace-utility-panel workspace-utility-panel-wide" open>
            <summary className="workspace-utility-summary">
              <strong>Search and pick a model</strong>
              <ChevronDown className="workspace-collapsible-chevron" size={16} />
            </summary>
            <div className="workspace-utility-body workspace-inline-stack">
              <label className="workspace-search-field">
                <Search size={16} />
                <input
                  className="auth-input"
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Search and pick a model"
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
                  Refresh
                </button>
              </div>

              {modelsError ? <p className="workspace-error">{modelsError}</p> : null}

              <div className="workspace-library-scroller">
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

                  {filteredModels.map((model) => {
                    return (
                      <button
                        className={`workspace-library-item ${
                          selectedModelId === model.id
                            ? 'workspace-library-item-active'
                            : ''
                        }`}
                        key={model.id}
                        onClick={() => handleSelectModel(model.id)}
                        type="button"
                      >
                        <div className="workspace-library-copy">
                          <strong>{model.name}</strong>
                          <p>{model.id}</p>
                        </div>
                        {selectedModelId === model.id ? <span>Selected</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </details>

          <details className="workspace-utility-panel">
            <summary className="workspace-utility-summary">
              <strong>Controls</strong>
              <ChevronDown className="workspace-collapsible-chevron" size={16} />
            </summary>
            <div className="workspace-utility-body workspace-inline-stack">
              <div className="workspace-controls-grid">
                <div className="workspace-setting-card">
                  <h4>Response mode</h4>
                  <div className="workspace-setting-pill-row">
                    {responseModeOptions.map((option) => (
                      <button
                        className={`workspace-setting-pill ${
                          responseMode === option.id ? 'workspace-setting-pill-active' : ''
                        }`}
                        disabled={option.id === 'text-image' && !canOutputImage}
                        key={option.id}
                        onClick={() => setResponseMode(option.id)}
                        type="button"
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                  {!canOutputImage ? (
                    <p className="workspace-inline-note">
                      This model outputs text only.
                    </p>
                  ) : null}
                </div>

                <div className="workspace-setting-card">
                  <h4>Thinking</h4>
                  <div className="workspace-setting-pill-row workspace-setting-pill-row-compact">
                    {reasoningEffortOptions.map((option) => (
                      <button
                        className={`workspace-setting-pill ${
                          reasoningEffort === option.id ? 'workspace-setting-pill-active' : ''
                        }`}
                        disabled={!supportsReasoning && option.id !== 'none'}
                        key={option.id}
                        onClick={() => setReasoningEffort(option.id)}
                        type="button"
                      >
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                  {!supportsReasoning ? (
                    <p className="workspace-inline-note">
                      This model does not expose reasoning controls.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="workspace-chat-column">
          <div className="workspace-chat-card">
            <div className="workspace-chat-header">
              <div className="workspace-chat-header-main">
                <div className="workspace-chat-heading">
                  <strong>{accountEmail}</strong>
                  {hasSavedApiKey ? (
                    <span>API key ready</span>
                  ) : (
                    <span className="workspace-api-warning">
                      Add API key in Settings to start chatting.
                    </span>
                  )}
                </div>
              </div>
              <div className="workspace-chat-header-actions">
                <button
                  className="button button-secondary"
                  onClick={handleClearThread}
                  type="button"
                >
                  <Trash2 size={16} />
                  New thread
                </button>
              </div>
            </div>

            {chatError ? <p className="workspace-error">{chatError}</p> : null}

            <div
              className={`workspace-message-stack${
                messages.length === 0 ? ' workspace-message-stack-empty' : ''
              }`}
              onScroll={handleMessageStackScroll}
              ref={messageStackRef}
            >
              {messages.map((message) => (
                <article
                  className={`workspace-message workspace-message-${message.role}`}
                  key={message.id}
                >
                  <RichMessageContent
                    attachments={message.attachments}
                    audio={message.audio}
                    images={message.images}
                    isStreaming={Boolean(message.isStreaming)}
                    reasoning={message.reasoning}
                    reasoningDetails={message.reasoningDetails}
                    refusal={message.refusal}
                    text={message.text}
                  />
                </article>
              ))}
            </div>

            <input
              accept={attachmentAccept}
              className="workspace-file-input"
              multiple
              onChange={handleAttachmentSelection}
              ref={attachmentInputRef}
              type="file"
            />

            <div className="workspace-composer">
              {attachments.length > 0 ? (
                <div className="workspace-draft-attachment-row">
                  {attachments.map((attachment) => {
                    const Icon =
                      attachment.kind === 'image'
                        ? ImagePlus
                        : attachment.kind === 'audio'
                          ? AudioLines
                          : attachment.kind === 'video'
                            ? Film
                            : attachment.kind === 'pdf'
                              ? FileText
                              : Code2

                    return (
                      <article
                        className="workspace-draft-attachment"
                        key={attachment.id}
                      >
                        {attachment.kind === 'image' && attachment.previewUrl ? (
                          <img
                            alt={attachment.name}
                            className="workspace-draft-attachment-preview"
                            loading="lazy"
                            src={attachment.previewUrl}
                          />
                        ) : (
                          <span className="workspace-draft-attachment-icon">
                            <Icon size={16} />
                          </span>
                        )}
                        <div>
                          <strong>{attachment.name}</strong>
                          <p>{attachment.summary}</p>
                        </div>
                        <button
                          aria-label={`Remove ${attachment.name}`}
                          className="workspace-draft-attachment-remove"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : null}

              <div className="workspace-input-wrapper">
                <button
                  aria-label="Add attachment"
                  className="workspace-attach-icon"
                  onClick={() => attachmentInputRef.current?.click()}
                  type="button"
                >
                  <Paperclip size={16} />
                </button>
                <textarea
                  className="workspace-textarea"
                  onChange={handleDraftMessageChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    hasSavedApiKey
                      ? 'Ask anything'
                      : 'Add API key in Settings to start chatting'
                  }
                  ref={composerTextareaRef}
                  rows={1}
                  spellCheck={false}
                  value={draftMessage}
                />
                <button
                  className="workspace-send-icon"
                  disabled={
                    isSending ||
                    !hasSavedApiKey ||
                    (!draftMessage.trim() && attachments.length === 0)
                  }
                  onClick={() => void handleSendMessage()}
                  type="button"
                  aria-label="Send message"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}

export { ChatWorkspace }
