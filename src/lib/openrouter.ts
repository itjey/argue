type OpenRouterPricing = Record<string, string | undefined>

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
    input_modalities?: string[]
    output_modalities?: string[]
  }
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  supported_parameters?: string[]
}

type OpenRouterChatRole = 'system' | 'user' | 'assistant'

type OpenRouterChatMessage = {
  role: OpenRouterChatRole
  content: string
}

type OpenRouterModelsResponse = {
  data?: OpenRouterModel[]
}

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string
            text?: string
          }>
    }
  }>
  error?: {
    message?: string
  }
}

type CreateOpenRouterChatCompletionOptions = {
  apiKey: string
  messages: OpenRouterChatMessage[]
  model: string
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

function extractChatText(response: OpenRouterChatResponse) {
  const content = response.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
  }

  return ''
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
}: CreateOpenRouterChatCompletionOptions) {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
    }),
  })

  const payload = (await response.json()) as OpenRouterChatResponse

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? 'OpenRouter rejected the chat request.',
    )
  }

  const content = extractChatText(payload)

  if (!content) {
    throw new Error('The selected model returned an empty response.')
  }

  return content
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

export type { OpenRouterChatMessage, OpenRouterModel }
