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
  AudioLines,
  Bot,
  BrainCircuit,
  Code2,
  FileText,
  Film,
  ImagePlus,
  KeyRound,
  LibraryBig,
  Lightbulb,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  createOpenRouterChatCompletion,
  createOpenRouterChatCompletionStream,
  fetchOpenRouterModels,
  formatModelDate,
  formatOpenRouterPrice,
  getRecentOpenRouterModels,
  type OpenRouterChatContentPart,
  type OpenRouterChatMessage,
  type OpenRouterModel,
  type OpenRouterOutputModality,
  type OpenRouterReasoningEffort,
  type OpenRouterReasoningDetail,
} from '../lib/openrouter'
import {
  getAttachmentSupportHint,
  getInputCapabilityLabels,
  getModelCapabilityProfile,
  getOutputCapabilityLabels,
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
import { ModelStatsPanel } from './ModelStatsPanel'

type ChatWorkspaceProps = {
  currentUser: User
  isVerified: boolean
  onOpenAccount: () => void
}

type WorkspaceAttachment = RichMessageAttachment & {
  contentPart?: OpenRouterChatContentPart
  inlineText?: string
}

type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  isStreaming?: boolean
  text: string
  images: string[]
  audio: RichMessageAudio | null
  reasoning: string
  reasoningDetails: OpenRouterReasoningDetail[]
  refusal: string
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

const promptSuggestions = [
  'Explain the core tradeoffs in using multiple models together.',
  'Help me debug a React component that rerenders too often.',
  'Design a schema for storing collaborative AI conversations.',
  'Summarize the newest OpenRouter models worth testing first.',
]

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

function formatLargeNumber(value?: number) {
  if (!value) {
    return 'n/a'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
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

function createLightbulbIcons(
  bulbs: number,
  prefix: string,
  mutedCount = 5,
) {
  return Array.from({ length: mutedCount }, (_, index) => (
    <span
      className={`workspace-lightbulb ${
        index < bulbs ? 'workspace-lightbulb-active' : ''
      }`}
      key={`${prefix}-${index}`}
    >
      <Lightbulb size={14} />
    </span>
  ))
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

function buildChatStatus(
  text: string,
  imageCount: number,
  reasoningCount: number,
  audioPresent: boolean,
) {
  const parts: string[] = []

  if (text.trim()) {
    parts.push('text')
  }

  if (imageCount > 0) {
    parts.push(imageCount === 1 ? '1 image' : `${imageCount} images`)
  }

  if (audioPresent) {
    parts.push('audio')
  }

  if (reasoningCount > 0) {
    parts.push('thinking details')
  }

  return parts.length > 0
    ? `OpenRouter returned ${parts.join(', ')}.`
    : 'Response returned from OpenRouter.'
}

function buildStreamingChatStatus(
  text: string,
  reasoningCount: number,
  hasRefusal: boolean,
) {
  if (reasoningCount > 0 && !text.trim()) {
    return 'Streaming thinking from OpenRouter.'
  }

  if (reasoningCount > 0 && text.trim()) {
    return 'Streaming thinking and answer from OpenRouter.'
  }

  if (hasRefusal) {
    return 'Streaming provider refusal details.'
  }

  return 'Streaming response from OpenRouter.'
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

function ChatWorkspace({
  currentUser,
  isVerified,
  onOpenAccount,
}: ChatWorkspaceProps) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
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
  const [statsSnapshot, setStatsSnapshot] = useState<OpenRouterStatsSnapshot | null>(
    null,
  )
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [draftMessage, setDraftMessage] = useState('')
  const [attachments, setAttachments] = useState<WorkspaceAttachment[]>([])
  const [responseMode, setResponseMode] = useState<ResponseMode>('auto')
  const [reasoningEffort, setReasoningEffort] =
    useState<OpenRouterReasoningEffort>('medium')
  const [chatError, setChatError] = useState('')
  const [chatStatus, setChatStatus] = useState('')
  const [isSending, setIsSending] = useState(false)
  const deferredModelSearch = useDeferredValue(modelSearch)

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
    void loadStatsSnapshot()
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
    const assistantMessageId = createId()
    const assistantPlaceholder = {
      id: assistantMessageId,
      role: 'assistant',
      isStreaming: true,
      text: '',
      images: [],
      audio: null,
      reasoning: '',
      reasoningDetails: [],
      refusal: '',
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

    setMessages(nextMessages)
    setDraftMessage('')
    setAttachments([])
    setChatError('')
    setChatStatus('')
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
                        request: buildAssistantRequestFromReply(partialReply),
                      }
                    : message,
                ),
              )
              setChatStatus(
                buildStreamingChatStatus(
                  partialReply.text,
                  partialReply.reasoningDetails.length +
                    (partialReply.reasoning ? 1 : 0),
                  Boolean(partialReply.refusal),
                ),
              )
            },
          })
        : await createOpenRouterChatCompletion(requestOptions)

      const assistantMessage = {
        ...assistantPlaceholder,
        isStreaming: false,
        text: assistantReply.text,
        images: assistantReply.images,
        audio: getAudioPayload(assistantReply.audio),
        reasoning: assistantReply.reasoning,
        reasoningDetails: assistantReply.reasoningDetails,
        refusal: assistantReply.refusal,
        request: buildAssistantRequestFromReply(assistantReply),
      } satisfies WorkspaceMessage

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId ? assistantMessage : message,
        ),
      )
      setChatStatus(
        buildChatStatus(
          assistantReply.text,
          assistantReply.images.length,
          assistantReply.reasoningDetails.length +
            (assistantReply.reasoning ? 1 : 0),
          Boolean(assistantReply.audio?.data || assistantReply.audio?.transcript),
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
    setChatStatus('Started a new thread.')
  }

  const recentModels = getRecentOpenRouterModels(models, 8)
  const filteredModels = models.filter((model) => {
    if (!deferredModelSearch.trim()) {
      return true
    }

    const searchableText = `${model.name} ${model.id} ${model.description}`.toLowerCase()
    return searchableText.includes(deferredModelSearch.trim().toLowerCase())
  })

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? recentModels[0] ?? null
  const selectedModelStats = resolveOpenRouterModelStats(statsSnapshot, selectedModel)
  const selectedModelProfile = selectedModel
    ? getModelCapabilityProfile(selectedModel, selectedModelStats)
    : null
  const catalogCountLabel = modelsLoading
    ? 'Refreshing the live OpenRouter catalog.'
    : `${models.length} models are available from the current OpenRouter index.`
  const attachmentAccept = getAttachmentAccept(selectedModelProfile)
  const composerHint = selectedModelProfile
    ? getAttachmentSupportHint(selectedModelProfile)
    : 'Choose a model to see which inputs it accepts.'

  return (
    <section className="workspace-home section" id="chat">
      <div className="workspace-home-header">
        <div>
          <p className="section-kicker">Workspace</p>
          <h1>Connect OpenRouter, choose any live model, and start chatting.</h1>
          <p className="workspace-home-copy">
            Argue reads OpenRouter&apos;s live catalog at runtime, then shapes the
            workspace around each model&apos;s real input, output, and reasoning
            support.
          </p>
        </div>
      </div>

      <div className="workspace-home-grid">
        <aside className="workspace-library-column" id="models">
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
              Your Firebase login unlocks the workspace. Your OpenRouter key stays
              local to this browser unless you choose to reuse it elsewhere.
            </p>
            <button
              className="button button-secondary"
              onClick={onOpenAccount}
              type="button"
            >
              Manage account
            </button>
          </div>

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
              <button
                className="button button-primary"
                onClick={handleSaveApiKey}
                type="button"
              >
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
              {recentModels.map((model) => {
                const modelStats = resolveOpenRouterModelStats(statsSnapshot, model)
                const profile = getModelCapabilityProfile(model, modelStats)

                return (
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
                    <div className="workspace-model-card-meta">
                      <div className="workspace-lightbulb-row">
                        {createLightbulbIcons(profile.smartness.bulbs, model.id)}
                      </div>
                      <div className="workspace-compact-tag-row">
                        {profile.isMultimodal ? (
                          <span className="workspace-compact-tag">Multimodal</span>
                        ) : (
                          <span className="workspace-compact-tag">Text</span>
                        )}
                        {profile.supportsReasoning ? (
                          <span className="workspace-compact-tag">
                            {profile.reasoningExposure.badge}
                          </span>
                        ) : null}
                        {profile.canOutputImage ? (
                          <span className="workspace-compact-tag">Image out</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                )
              })}
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

              {filteredModels.map((model) => {
                const modelStats = resolveOpenRouterModelStats(statsSnapshot, model)
                const profile = getModelCapabilityProfile(model, modelStats)

                return (
                  <button
                    className={`workspace-library-item ${
                      selectedModelId === model.id ? 'workspace-library-item-active' : ''
                    }`}
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    type="button"
                  >
                    <div className="workspace-library-copy">
                      <strong>{model.name}</strong>
                      <p>{model.id}</p>
                      <div className="workspace-library-support">
                        <div className="workspace-lightbulb-row">
                          {createLightbulbIcons(profile.smartness.bulbs, `${model.id}-list`)}
                        </div>
                        <div className="workspace-compact-tag-row">
                          {profile.supportsReasoning ? (
                            <span className="workspace-compact-tag">
                              {profile.reasoningExposure.badge}
                            </span>
                          ) : null}
                          {profile.isMultimodal ? (
                            <span className="workspace-compact-tag">Multimodal</span>
                          ) : null}
                          {profile.canOutputImage ? (
                            <span className="workspace-compact-tag">Image out</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <span>{formatLargeNumber(model.context_length)} ctx</span>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <div className="workspace-chat-column">
          <div className="control-card workspace-chat-card">
            <div className="workspace-chat-header">
              <div>
                <p className="panel-label">Chat</p>
                <h3>Direct conversation with the model you selected</h3>
              </div>
              <button
                className="button button-secondary"
                onClick={handleClearThread}
                type="button"
              >
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
                      Save your OpenRouter key, choose a model, and send text, code,
                      or supported attachments.
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

            <input
              accept={attachmentAccept}
              className="workspace-file-input"
              multiple
              onChange={handleAttachmentSelection}
              ref={attachmentInputRef}
              type="file"
            />

            <div className="workspace-composer">
              <div className="workspace-composer-toolbar">
                <div className="workspace-inline-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => attachmentInputRef.current?.click()}
                    type="button"
                  >
                    <Paperclip size={16} />
                    Attach
                  </button>
                </div>

                <div className="workspace-composer-capabilities">
                  <div className="workspace-composer-capability">
                    <ImagePlus size={14} />
                    <span>
                      {selectedModelProfile?.canInputImage
                        ? 'Image input ready'
                        : 'No image input'}
                    </span>
                  </div>
                  <div className="workspace-composer-capability">
                    <FileText size={14} />
                    <span>
                      {selectedModelProfile?.canInputFile
                        ? 'PDF input ready'
                        : 'PDF input hidden'}
                    </span>
                  </div>
                  <div className="workspace-composer-capability">
                    <Code2 size={14} />
                    <span>Code files inline as text</span>
                  </div>
                  <div className="workspace-composer-capability">
                    <BrainCircuit size={14} />
                    <span>
                      {selectedModelProfile?.supportsReasoning
                        ? `Thinking ${reasoningEffort === 'none' ? 'off' : reasoningEffort}`
                        : 'No thinking controls'}
                    </span>
                  </div>
                </div>
              </div>

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

              <textarea
                className="workspace-textarea"
                onChange={(event) => setDraftMessage(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask the selected model anything, attach files it can understand, or request an image from image-capable models..."
                spellCheck={false}
                value={draftMessage}
              />
              <p className="workspace-composer-note">{composerHint}</p>
              <button
                className="button button-primary"
                disabled={isSending || (!draftMessage.trim() && attachments.length === 0)}
                onClick={() => void handleSendMessage()}
                type="button"
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </div>

        <aside className="workspace-detail-column">
          <div className="control-card workspace-selected-model-card">
            <div className="control-card-header">
              <div>
                <p className="panel-label">Selected model</p>
                <h3>{selectedModel?.name ?? 'Choose a model'}</h3>
              </div>
              <Bot size={18} />
            </div>

            {selectedModel && selectedModelProfile ? (
              <>
                <p className="workspace-selected-model-copy">
                  {selectedModel.description}
                </p>

                <div className="workspace-model-capability-overview">
                  <div className="workspace-smartness-card">
                    <div className="workspace-smartness-copy">
                      <span>Smartness</span>
                      <strong>{selectedModelProfile.smartness.score}/100</strong>
                    </div>
                    <div className="workspace-lightbulb-row workspace-lightbulb-row-large">
                      {createLightbulbIcons(
                        selectedModelProfile.smartness.bulbs,
                        `${selectedModel.id}-selected`,
                      )}
                    </div>
                    <p>
                      {selectedModelProfile.smartness.label}.{' '}
                      {selectedModelProfile.smartness.detail}
                    </p>
                  </div>

                  <div className="workspace-capability-grid">
                    <div className="workspace-capability-column">
                      <span>Understands</span>
                      <div className="workspace-capability-chip-row">
                        {getInputCapabilityLabels(selectedModelProfile).map((label) => (
                          <span className="workspace-capability-chip" key={label}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="workspace-capability-column">
                      <span>Returns</span>
                      <div className="workspace-capability-chip-row">
                        {getOutputCapabilityLabels(selectedModelProfile).map((label) => (
                          <span className="workspace-capability-chip" key={label}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="workspace-capability-column">
                      <span>Modes</span>
                      <div className="workspace-capability-chip-row">
                        {selectedModelProfile.isMultimodal ? (
                          <span className="workspace-capability-chip">Multimodal</span>
                        ) : null}
                        {selectedModelProfile.supportsReasoning ? (
                          <span className="workspace-capability-chip">
                            {selectedModelProfile.reasoningExposure.badge}
                          </span>
                        ) : null}
                        {selectedModelProfile.supportsTools ? (
                          <span className="workspace-capability-chip">Tools</span>
                        ) : null}
                        {selectedModelProfile.supportsStructuredOutputs ? (
                          <span className="workspace-capability-chip">
                            Structured output
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

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

                {selectedModelProfile.canOutputImage ? (
                  <div className="workspace-setting-card">
                    <div className="workspace-setting-copy">
                      <p className="panel-label">Output mode</p>
                      <h4>Control whether image-capable models return pictures.</h4>
                    </div>
                    <div className="workspace-setting-pill-row">
                      {responseModeOptions.map((option) => (
                        <button
                          className={`workspace-setting-pill ${
                            responseMode === option.id
                              ? 'workspace-setting-pill-active'
                              : ''
                          }`}
                          key={option.id}
                          onClick={() => setResponseMode(option.id)}
                          type="button"
                        >
                          <strong>{option.label}</strong>
                          <span>{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedModelProfile.supportsReasoning ? (
                  <div className="workspace-setting-card">
                    <div className="workspace-setting-copy">
                      <p className="panel-label">Thinking depth</p>
                      <h4>Ask reasoning-capable models to expose more of their trace.</h4>
                      <p className="workspace-setting-detail">
                        {selectedModelProfile.reasoningExposure.detail}
                      </p>
                    </div>
                    <div className="workspace-setting-pill-row workspace-setting-pill-row-compact">
                      {reasoningEffortOptions.map((option) => (
                        <button
                          className={`workspace-setting-pill ${
                            reasoningEffort === option.id
                              ? 'workspace-setting-pill-active'
                              : ''
                          }`}
                          key={option.id}
                          onClick={() => setReasoningEffort(option.id)}
                          type="button"
                        >
                          <strong>{option.label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="workspace-inline-note">{composerHint}</p>
              </>
            ) : null}
          </div>

          <ModelStatsPanel
            modelName={selectedModel?.name ?? 'Selected model'}
            snapshotRefreshedAt={statsSnapshot?.refreshedAt ?? null}
            statsEntry={selectedModelStats}
            statsError={statsError}
            statsLoading={statsLoading}
          />
        </aside>
      </div>
    </section>
  )
}

export { ChatWorkspace }
