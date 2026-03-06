type OpenRouterPricing = Record<string, string | undefined>
type OpenRouterInputModality = 'text' | 'image' | 'file' | 'audio' | 'video'
type OpenRouterOutputModality = 'text' | 'image' | 'audio'
type OpenRouterReasoningEffort =
  | 'xhigh'
  | 'high'
  | 'medium'
  | 'low'
  | 'minimal'
  | 'none'
type OpenRouterReasoningSummary = 'auto' | 'concise' | 'detailed'

type OpenRouterModel = {
  id: string
  canonical_slug?: string
  name: string
  description: string
  created?: number
  context_length?: number
  pricing?: OpenRouterPricing
  architecture?: {
    modality?: string
    input_modalities?: OpenRouterInputModality[]
    output_modalities?: OpenRouterOutputModality[]
  }
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  supported_parameters?: string[]
}

type OpenRouterChatRole = 'system' | 'user' | 'assistant'

type OpenRouterTextContentPart = {
  type: 'text'
  text: string
}

type OpenRouterImageContentPart = {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

type OpenRouterFileContentPart = {
  type: 'file'
  file: {
    file_data?: string
    file_id?: string
    filename?: string
  }
}

type OpenRouterAudioContentPart = {
  type: 'input_audio'
  input_audio: {
    data: string
    format: string
  }
}

type OpenRouterVideoContentPart = {
  type: 'video_url'
  video_url: {
    url: string
  }
}

type OpenRouterChatContentPart =
  | OpenRouterTextContentPart
  | OpenRouterImageContentPart
  | OpenRouterFileContentPart
  | OpenRouterAudioContentPart
  | OpenRouterVideoContentPart

type OpenRouterReasoningDetail =
  | {
      type: 'reasoning.summary'
      summary: string
      id?: string | null
      format?: string | null
      index?: number
    }
  | {
      type: 'reasoning.text'
      text?: string | null
      signature?: string | null
      id?: string | null
      format?: string | null
      index?: number
    }
  | {
      type: 'reasoning.encrypted'
      data: string
      id?: string | null
      format?: string | null
      index?: number
    }

type OpenRouterAssistantImage = {
  image_url?: {
    url?: string
  }
}

type OpenRouterAssistantAudio = {
  id?: string
  expires_at?: number
  data?: string
  transcript?: string
}

type OpenRouterChatMessage = {
  role: OpenRouterChatRole
  content?: string | OpenRouterChatContentPart[] | null
  reasoning_details?: OpenRouterReasoningDetail[]
  images?: OpenRouterAssistantImage[]
  audio?: OpenRouterAssistantAudio
  phase?: string | null
}

type OpenRouterModelsResponse = {
  data?: OpenRouterModel[]
}

type OpenRouterChatChoice = {
  message?: {
    content?: string | OpenRouterChatContentPart[] | null
    reasoning?: string | null
    reasoning_details?: OpenRouterReasoningDetail[]
    images?: OpenRouterAssistantImage[]
    audio?: OpenRouterAssistantAudio
    refusal?: string | null
    phase?: string | null
  }
}

type OpenRouterChatResponse = {
  choices?: OpenRouterChatChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
  }
}

type OpenRouterAssistantReply = {
  text: string
  contentParts: OpenRouterChatContentPart[]
  images: string[]
  audio: OpenRouterAssistantAudio | null
  reasoning: string
  reasoningDetails: OpenRouterReasoningDetail[]
  refusal: string
  phase: string | null
  usage: OpenRouterChatResponse['usage'] | null
}

type CreateOpenRouterChatCompletionOptions = {
  apiKey: string
  messages: OpenRouterChatMessage[]
  model: string
  modalities?: OpenRouterOutputModality[]
  reasoning?: {
    effort?: OpenRouterReasoningEffort
    summary?: OpenRouterReasoningSummary
  }
  imageConfig?: Record<string, number | string | Array<unknown>>
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const APP_TITLE = 'Argue'

function getAppOrigin() {
  if (typeof window === 'undefined') {
    return 'https://itjey.github.io/argue/'
  }

  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function requestHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': getAppOrigin(),
    'X-Title': APP_TITLE,
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

function extractChatText(
  content: string | OpenRouterChatContentPart[] | null | undefined,
) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text?.trim() ?? '' : ''))
      .filter(Boolean)
      .join('\n\n')
  }

  return ''
}

function extractContentParts(
  content: string | OpenRouterChatContentPart[] | null | undefined,
) {
  if (Array.isArray(content)) {
    return content
  }

  if (typeof content === 'string' && content.trim()) {
    return [
      {
        type: 'text',
        text: content.trim(),
      },
    ] satisfies OpenRouterChatContentPart[]
  }

  return []
}

function extractAssistantReply(response: OpenRouterChatResponse) {
  const message = response.choices?.[0]?.message

  if (!message) {
    throw new Error('OpenRouter returned an invalid chat response.')
  }

  const contentParts = extractContentParts(message.content)
  const text = extractChatText(message.content)
  const images = (message.images ?? [])
    .map((entry) => entry.image_url?.url?.trim() ?? '')
    .filter(Boolean)
  const reasoning = message.reasoning?.trim() ?? ''
  const reasoningDetails = message.reasoning_details ?? []
  const refusal = message.refusal?.trim() ?? ''

  if (
    !text &&
    images.length === 0 &&
    !message.audio?.data &&
    !message.audio?.transcript &&
    !reasoning &&
    reasoningDetails.length === 0 &&
    !refusal
  ) {
    throw new Error('The selected model returned an empty response.')
  }

  return {
    text,
    contentParts,
    images,
    audio: message.audio ?? null,
    reasoning,
    reasoningDetails,
    refusal,
    phase: message.phase ?? null,
    usage: response.usage ?? null,
  } satisfies OpenRouterAssistantReply
}

async function fetchOpenRouterModels() {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: requestHeaders(),
  })

  if (!response.ok) {
    throw new Error('OpenRouter model catalog could not be loaded right now.')
  }

  const payload = (await response.json()) as OpenRouterModelsResponse
  const models = (payload.data ?? [])
    .filter((model): model is OpenRouterModel => Boolean(model?.id))
    .map((model) => ({
      ...model,
      name: model.name?.trim() || model.id,
      description: model.description?.trim() || 'No description available yet.',
    }))

  return models.sort((left, right) => left.name.localeCompare(right.name))
}

async function createOpenRouterChatCompletion({
  apiKey,
  messages,
  model,
  modalities,
  reasoning,
  imageConfig,
}: CreateOpenRouterChatCompletionOptions) {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      modalities,
      reasoning,
      image_config: imageConfig,
    }),
  })

  const payload = (await response.json()) as OpenRouterChatResponse

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? 'OpenRouter rejected the chat request.',
    )
  }

  return extractAssistantReply(payload)
}

function getRecentOpenRouterModels(models: OpenRouterModel[], limit = 12) {
  return [...models]
    .sort((left, right) => (right.created ?? 0) - (left.created ?? 0))
    .slice(0, limit)
}

function formatOpenRouterPrice(value?: string) {
  if (!value) {
    return 'n/a'
  }

  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return 'n/a'
  }

  const perMillion = numericValue * 1_000_000
  const decimals = perMillion < 0.01 ? 4 : perMillion < 0.1 ? 3 : 2

  return `$${perMillion.toFixed(decimals)}/M`
}

function formatModelDate(unixTimestamp?: number) {
  if (!unixTimestamp) {
    return 'Unknown'
  }

  return new Date(unixTimestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export {
  createOpenRouterChatCompletion,
  fetchOpenRouterModels,
  formatModelDate,
  formatOpenRouterPrice,
  getRecentOpenRouterModels,
}

export type {
  CreateOpenRouterChatCompletionOptions,
  OpenRouterAssistantAudio,
  OpenRouterAssistantReply,
  OpenRouterChatContentPart,
  OpenRouterChatMessage,
  OpenRouterInputModality,
  OpenRouterModel,
  OpenRouterOutputModality,
  OpenRouterReasoningDetail,
  OpenRouterReasoningEffort,
}
