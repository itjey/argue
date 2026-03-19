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
type OpenRouterReasoningConfig = {
  effort?: OpenRouterReasoningEffort
  summary?: OpenRouterReasoningSummary
  max_tokens?: number
  exclude?: boolean
}

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

type OpenRouterUrlCitation = {
  url: string
  title?: string
  content?: string
  start_index?: number
  end_index?: number
}

type OpenRouterCitationContentPart = {
  type: 'citation'
  url_citation: OpenRouterUrlCitation
}

type OpenRouterChatContentPart =
  | OpenRouterTextContentPart
  | OpenRouterImageContentPart
  | OpenRouterFileContentPart
  | OpenRouterAudioContentPart
  | OpenRouterVideoContentPart
  | OpenRouterCitationContentPart

type OpenRouterPlugin = {
  id: string
}

type OpenRouterWebSearchOptions = {
  search_context_size?: 'low' | 'medium' | 'high'
}

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
  reasoning?: string | null
  reasoning_details?: OpenRouterReasoningDetail[]
  images?: OpenRouterAssistantImage[]
  audio?: OpenRouterAssistantAudio
  phase?: string | null
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

type OpenRouterChatDelta = {
  content?: string | OpenRouterChatContentPart[] | null
  reasoning?: string | null
  reasoning_details?: OpenRouterReasoningDetail[]
  images?: OpenRouterAssistantImage[]
  audio?: OpenRouterAssistantAudio
  refusal?: string | null
  phase?: string | null
}

type OpenRouterChatStreamChunk = {
  choices?: Array<{
    delta?: OpenRouterChatDelta
    finish_reason?: string | null
  }>
  usage?: OpenRouterChatResponse['usage']
  error?: {
    message?: string
  }
}

type OpenRouterTokenDetails = {
  reasoning_tokens?: number
  cached_tokens?: number
  audio_tokens?: number
  image_tokens?: number
  [key: string]: number | undefined
}

type OpenRouterUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: OpenRouterTokenDetails
  completion_tokens_details?: OpenRouterTokenDetails
}

type OpenRouterChatResponse = {
  choices?: OpenRouterChatChoice[]
  usage?: OpenRouterUsage
  error?: {
    message?: string
  }
}

type OpenRouterAssistantReply = {
  text: string
  contentParts: OpenRouterChatContentPart[]
  citations: OpenRouterUrlCitation[]
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
  includeReasoning?: boolean
  maxTokens?: number
  modalities?: OpenRouterOutputModality[]
  reasoning?: OpenRouterReasoningConfig
  imageConfig?: Record<string, number | string | Array<unknown>>
  plugins?: OpenRouterPlugin[]
  webSearchOptions?: OpenRouterWebSearchOptions
}

type CreateOpenRouterChatCompletionStreamOptions =
  CreateOpenRouterChatCompletionOptions & {
    onProgress?: (reply: OpenRouterAssistantReply) => void
  }

const OPENROUTER_CHAT_URL =
  import.meta.env?.VITE_PROXY_URL || 'https://openrouter.ai/api/v1/chat/completions'
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

function normalizeOpenRouterModel(model: OpenRouterModel): OpenRouterModel {
  return {
    ...model,
    name: model.name?.trim() || model.id,
    description: model.description?.trim() || 'No description available yet.',
  }
}

async function getBundledOpenRouterModels() {
  const { BUNDLED_OPENROUTER_MODELS } = await import('./fallbackCatalog')

  return BUNDLED_OPENROUTER_MODELS.map((model) =>
    normalizeOpenRouterModel(model as OpenRouterModel),
  ).sort((left, right) => left.name.localeCompare(right.name))
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

function extractCitations(
  content: string | OpenRouterChatContentPart[] | null | undefined,
) {
  if (!Array.isArray(content)) {
    return []
  }

  return content
    .filter(
      (part): part is OpenRouterCitationContentPart => part.type === 'citation',
    )
    .map((part) => part.url_citation)
    .filter((citation) => Boolean(citation?.url))
}

function extractAssistantReply(response: OpenRouterChatResponse) {
  const message = response.choices?.[0]?.message

  if (!message) {
    throw new Error('OpenRouter returned an invalid chat response.')
  }

  const contentParts = extractContentParts(message.content)
  const text = extractChatText(message.content)
  const citations = extractCitations(message.content)
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
    citations,
    images,
    audio: message.audio ?? null,
    reasoning,
    reasoningDetails,
    refusal,
    phase: message.phase ?? null,
    usage: response.usage ?? null,
  } satisfies OpenRouterAssistantReply
}

function getCitationKey(citation: OpenRouterUrlCitation) {
  return [
    citation.url,
    citation.title ?? '',
    citation.start_index ?? '',
    citation.end_index ?? '',
  ].join('::')
}

function appendUniqueCitations(
  currentCitations: OpenRouterUrlCitation[],
  nextCitations: OpenRouterUrlCitation[],
) {
  const seenValues = new Set(currentCitations.map(getCitationKey))
  const mergedValues = [...currentCitations]

  for (const citation of nextCitations) {
    const key = getCitationKey(citation)

    if (!citation.url || seenValues.has(key)) {
      continue
    }

    seenValues.add(key)
    mergedValues.push(citation)
  }

  return mergedValues
}

function appendUniqueStrings(currentValues: string[], nextValues: string[]) {
  const seenValues = new Set(currentValues)
  const mergedValues = [...currentValues]

  for (const value of nextValues) {
    if (!value || seenValues.has(value)) {
      continue
    }

    seenValues.add(value)
    mergedValues.push(value)
  }

  return mergedValues
}

function mergeTextFragments(previousValue: string, nextValue?: string | null) {
  const nextFragment = nextValue ?? ''

  if (!nextFragment) {
    return previousValue
  }

  if (!previousValue) {
    return nextFragment
  }

  if (nextFragment.startsWith(previousValue)) {
    return nextFragment
  }

  if (previousValue.endsWith(nextFragment)) {
    return previousValue
  }

  return `${previousValue}${nextFragment}`
}

function getReasoningDetailKey(detail: OpenRouterReasoningDetail) {
  return detail.id ?? `${detail.type}:${detail.index ?? 'na'}:${detail.format ?? 'na'}`
}

function mergeReasoningDetail(
  previousDetail: OpenRouterReasoningDetail,
  nextDetail: OpenRouterReasoningDetail,
): OpenRouterReasoningDetail {
  if (
    previousDetail.type === 'reasoning.summary' &&
    nextDetail.type === 'reasoning.summary'
  ) {
    return {
      ...previousDetail,
      ...nextDetail,
      summary: mergeTextFragments(previousDetail.summary, nextDetail.summary),
    }
  }

  if (
    previousDetail.type === 'reasoning.text' &&
    nextDetail.type === 'reasoning.text'
  ) {
    return {
      ...previousDetail,
      ...nextDetail,
      text: mergeTextFragments(previousDetail.text?.trim() ?? '', nextDetail.text),
      signature: nextDetail.signature ?? previousDetail.signature,
    }
  }

  if (
    previousDetail.type === 'reasoning.encrypted' &&
    nextDetail.type === 'reasoning.encrypted'
  ) {
    return {
      ...previousDetail,
      ...nextDetail,
      data: mergeTextFragments(previousDetail.data, nextDetail.data),
    }
  }

  return nextDetail
}

function mergeReasoningDetails(
  currentDetails: OpenRouterReasoningDetail[],
  nextDetails: OpenRouterReasoningDetail[] | undefined,
) {
  if (!nextDetails || nextDetails.length === 0) {
    return currentDetails
  }

  const mergedDetails = [...currentDetails]
  const detailIndexes = new Map<string, number>()

  mergedDetails.forEach((detail, index) => {
    detailIndexes.set(getReasoningDetailKey(detail), index)
  })

  for (const nextDetail of nextDetails) {
    const detailKey = getReasoningDetailKey(nextDetail)
    const existingIndex = detailIndexes.get(detailKey)

    if (existingIndex == null) {
      detailIndexes.set(detailKey, mergedDetails.length)
      mergedDetails.push(nextDetail)
      continue
    }

    mergedDetails[existingIndex] = mergeReasoningDetail(
      mergedDetails[existingIndex],
      nextDetail,
    )
  }

  return mergedDetails.sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
}

function createEmptyAssistantReply(): OpenRouterAssistantReply {
  return {
    text: '',
    contentParts: [],
    citations: [],
    images: [],
    audio: null,
    reasoning: '',
    reasoningDetails: [],
    refusal: '',
    phase: null,
    usage: null,
  } satisfies OpenRouterAssistantReply
}

function getTextDelta(content: string | OpenRouterChatContentPart[] | null | undefined) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
      .join('')
  }

  return ''
}

function applyStreamDelta(
  currentReply: OpenRouterAssistantReply,
  delta: OpenRouterChatDelta,
  usage: OpenRouterChatResponse['usage'] | undefined,
) {
  const nextText = `${currentReply.text}${getTextDelta(delta.content)}`

  return {
    text: nextText,
    contentParts: nextText
      ? [
          {
            type: 'text',
            text: nextText,
          },
        ]
      : [],
    citations: appendUniqueCitations(
      currentReply.citations,
      extractCitations(delta.content),
    ),
    images: appendUniqueStrings(
      currentReply.images,
      (delta.images ?? [])
        .map((entry) => entry.image_url?.url?.trim() ?? '')
        .filter(Boolean),
    ),
    audio: delta.audio ?? currentReply.audio,
    reasoning: `${currentReply.reasoning}${delta.reasoning ?? ''}`.trim(),
    reasoningDetails: mergeReasoningDetails(
      currentReply.reasoningDetails,
      delta.reasoning_details,
    ),
    refusal: `${currentReply.refusal}${delta.refusal ?? ''}`.trim(),
    phase: delta.phase ?? currentReply.phase,
    usage: usage ?? currentReply.usage,
  } satisfies OpenRouterAssistantReply
}

function extractSsePayload(rawEvent: string) {
  const dataLines = rawEvent
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())

  if (dataLines.length === 0) {
    return null
  }

  return dataLines.join('\n')
}

async function fetchOpenRouterModels() {
  return getBundledOpenRouterModels()
}

async function createOpenRouterChatCompletion({
  apiKey,
  includeReasoning,
  maxTokens,
  messages,
  model,
  modalities,
  reasoning,
  imageConfig,
  plugins,
  webSearchOptions,
}: CreateOpenRouterChatCompletionOptions) {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      include_reasoning: includeReasoning,
      max_tokens: maxTokens,
      modalities,
      reasoning,
      image_config: imageConfig,
      plugins,
      web_search_options: webSearchOptions,
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

async function processStreamResponse(
  response: Response,
  onProgress?: (reply: OpenRouterAssistantReply) => void,
): Promise<OpenRouterAssistantReply> {
  if (!response.body) {
    throw new Error('The browser could not read the streaming chat response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let aggregatedReply = createEmptyAssistantReply()
  let streamFinished = false

  function processEvent(rawEvent: string) {
    const normalizedEvent = rawEvent.replace(/\r\n/g, '\n').trim()
    if (!normalizedEvent) return

    const payload = extractSsePayload(normalizedEvent)
    if (!payload) return

    if (payload === '[DONE]') {
      streamFinished = true
      return
    }

    const chunk = JSON.parse(payload) as OpenRouterChatStreamChunk
    if (chunk.error?.message) throw new Error(chunk.error.message)

    const delta = chunk.choices?.[0]?.delta
    if (!delta) {
      if (chunk.usage) {
        aggregatedReply = { ...aggregatedReply, usage: chunk.usage }
      }
      return
    }

    aggregatedReply = applyStreamDelta(aggregatedReply, delta, chunk.usage)
    onProgress?.(aggregatedReply)
  }

  while (!streamFinished) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      break
    }
    buffer += decoder.decode(value, { stream: true })
    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      processEvent(rawEvent)
      separatorIndex = buffer.indexOf('\n\n')
    }
  }

  if (buffer.trim()) processEvent(buffer)

  if (
    !aggregatedReply.text &&
    aggregatedReply.images.length === 0 &&
    !aggregatedReply.audio?.data &&
    !aggregatedReply.audio?.transcript &&
    !aggregatedReply.reasoning &&
    aggregatedReply.reasoningDetails.length === 0 &&
    !aggregatedReply.refusal
  ) {
    throw new Error('The selected model returned an empty response.')
  }

  return aggregatedReply
}

async function createOpenRouterChatCompletionStream({
  apiKey,
  includeReasoning,
  maxTokens,
  messages,
  model,
  modalities,
  onProgress,
  reasoning,
  imageConfig,
  plugins,
  webSearchOptions,
}: CreateOpenRouterChatCompletionStreamOptions) {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      include_reasoning: includeReasoning,
      max_tokens: maxTokens,
      modalities,
      reasoning,
      image_config: imageConfig,
      plugins,
      web_search_options: webSearchOptions,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(async () => ({
      error: { message: await response.text() },
    }))) as OpenRouterChatResponse

    throw new Error(
      payload.error?.message ?? 'OpenRouter rejected the streaming chat request.',
    )
  }

  return await processStreamResponse(response, onProgress)
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
  createOpenRouterChatCompletionStream,
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
  OpenRouterPlugin,
  OpenRouterReasoningDetail,
  OpenRouterReasoningEffort,
  OpenRouterReasoningConfig,
  OpenRouterTokenDetails,
  OpenRouterUrlCitation,
  OpenRouterUsage,
  OpenRouterWebSearchOptions,
}
