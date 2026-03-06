import type {
  OpenRouterInputModality,
  OpenRouterModel,
  OpenRouterOutputModality,
} from './openrouter'
import type {
  OpenRouterBenchmarkSnapshot,
  OpenRouterModelStatsEntry,
} from './openrouterStats'

type OpenRouterSmartnessProfile = {
  score: number
  bulbs: number
  source: 'benchmark' | 'estimate'
  label: string
  detail: string
}

type OpenRouterModelCapabilityProfile = {
  inputModalities: OpenRouterInputModality[]
  outputModalities: OpenRouterOutputModality[]
  canInputText: boolean
  canInputImage: boolean
  canInputFile: boolean
  canInputAudio: boolean
  canInputVideo: boolean
  canOutputText: boolean
  canOutputImage: boolean
  canOutputAudio: boolean
  isMultimodal: boolean
  supportsReasoning: boolean
  reasoningExposure: {
    badge: string
    detail: string
    kind: 'trace' | 'hybrid' | 'protected' | 'provider' | 'none'
  }
  supportsStructuredOutputs: boolean
  supportsTools: boolean
  smartness: OpenRouterSmartnessProfile
}

const INPUT_MODALITY_ORDER: OpenRouterInputModality[] = [
  'text',
  'image',
  'file',
  'audio',
  'video',
]

const OUTPUT_MODALITY_ORDER: OpenRouterOutputModality[] = ['text', 'image', 'audio']

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function uniqueValues<T extends string>(values: T[]) {
  return [...new Set(values)]
}

function normalizeInputModalities(model: OpenRouterModel) {
  const directValues = (model.architecture?.input_modalities ?? []).filter(Boolean)

  if (directValues.length > 0) {
    return uniqueValues(
      directValues.filter((value): value is OpenRouterInputModality =>
        INPUT_MODALITY_ORDER.includes(value),
      ),
    )
  }

  const modality = model.architecture?.modality ?? ''
  const [inputChunk] = modality.split('->')

  return uniqueValues(
    inputChunk
      ?.split('+')
      .map((value) => value.trim())
      .filter((value): value is OpenRouterInputModality =>
        INPUT_MODALITY_ORDER.includes(value as OpenRouterInputModality),
      ) ?? ['text'],
  )
}

function normalizeOutputModalities(model: OpenRouterModel) {
  const directValues = (model.architecture?.output_modalities ?? []).filter(Boolean)

  if (directValues.length > 0) {
    return uniqueValues(
      directValues.filter((value): value is OpenRouterOutputModality =>
        OUTPUT_MODALITY_ORDER.includes(value),
      ),
    )
  }

  const modality = model.architecture?.modality ?? ''
  const [, outputChunk] = modality.split('->')

  return uniqueValues(
    outputChunk
      ?.split('+')
      .map((value) => value.trim())
      .filter((value): value is OpenRouterOutputModality =>
        OUTPUT_MODALITY_ORDER.includes(value as OpenRouterOutputModality),
      ) ?? ['text'],
  )
}

function collectBenchmarkPercentiles(benchmarks: OpenRouterBenchmarkSnapshot[]) {
  const values: number[] = []

  for (const benchmark of benchmarks) {
    const intelligence = benchmark.percentiles?.intelligence_percentile
    const coding = benchmark.percentiles?.coding_percentile
    const agentic = benchmark.percentiles?.agentic_percentile

    if (typeof intelligence === 'number') {
      values.push(intelligence)
    }

    if (typeof coding === 'number') {
      values.push(coding)
    }

    if (typeof agentic === 'number') {
      values.push(agentic)
    }
  }

  return values
}

function estimateSmartnessScore(
  model: OpenRouterModel,
  capabilityProfile: Omit<OpenRouterModelCapabilityProfile, 'smartness'>,
) {
  let score = 32

  if (capabilityProfile.supportsReasoning) {
    score += 20
  }

  if (capabilityProfile.supportsTools) {
    score += 8
  }

  if (capabilityProfile.supportsStructuredOutputs) {
    score += 5
  }

  if (capabilityProfile.isMultimodal) {
    score += 6
  }

  const contextLength =
    model.context_length ?? model.top_provider?.context_length ?? 0

  if (contextLength >= 1_000_000) {
    score += 18
  } else if (contextLength >= 200_000) {
    score += 14
  } else if (contextLength >= 128_000) {
    score += 10
  } else if (contextLength >= 64_000) {
    score += 6
  } else if (contextLength >= 32_000) {
    score += 3
  }

  if (capabilityProfile.canOutputImage) {
    score += 3
  }

  return clamp(score, 18, 95)
}

function getSmartnessProfile(
  model: OpenRouterModel,
  statsEntry: OpenRouterModelStatsEntry | null,
  capabilityProfile: Omit<OpenRouterModelCapabilityProfile, 'smartness'>,
) {
  const benchmarkValues = collectBenchmarkPercentiles(statsEntry?.benchmarks ?? [])
  const benchmarkScore =
    benchmarkValues.length > 0
      ? benchmarkValues.reduce((total, value) => total + value, 0) /
        benchmarkValues.length
      : null
  const score = Math.round(
    benchmarkScore ?? estimateSmartnessScore(model, capabilityProfile),
  )
  const bulbs = clamp(Math.round(score / 20), 1, 5)

  if (benchmarkScore != null) {
    return {
      score,
      bulbs,
      source: 'benchmark',
      label: 'Benchmark-derived',
      detail: 'Based on OpenRouter benchmark percentiles when public data exists.',
    } satisfies OpenRouterSmartnessProfile
  }

  return {
    score,
    bulbs,
    source: 'estimate',
    label: 'Capability estimate',
    detail:
      'Estimated from context window, reasoning support, tool support, and modality range when benchmark data is missing.',
  } satisfies OpenRouterSmartnessProfile
}

function getReasoningExposure(model: OpenRouterModel, supportsReasoning: boolean) {
  if (!supportsReasoning) {
    return {
      badge: 'No thinking',
      detail: 'This model does not advertise provider reasoning support in the OpenRouter catalog.',
      kind: 'none',
    } as const
  }

  const searchableId = `${model.id} ${model.canonical_slug ?? ''} ${model.name}`.toLowerCase()

  if (
    searchableId.includes('deepseek-r1') ||
    searchableId.includes('kimi') ||
    searchableId.includes('thinking') ||
    searchableId.includes('minimax/m2') ||
    searchableId.includes('intellect') ||
    searchableId.includes('nemotron') ||
    searchableId.includes('mimo') ||
    searchableId.includes('glm 4.5') ||
    searchableId.includes('glm-4.5')
  ) {
    return {
      badge: 'Trace COT',
      detail: 'This family usually exposes visible step-by-step reasoning text through OpenRouter.',
      kind: 'trace',
    } as const
  }

  if (searchableId.startsWith('anthropic/') || searchableId.includes('claude')) {
    return {
      badge: 'Hybrid thinking',
      detail: 'This family often returns a mix of summaries, text traces, or protected reasoning blocks depending on the model version.',
      kind: 'hybrid',
    } as const
  }

  if (
    searchableId.startsWith('openai/') ||
    searchableId.includes('/o1') ||
    searchableId.includes('/o3') ||
    searchableId.includes('gpt-5') ||
    searchableId.startsWith('google/') ||
    searchableId.includes('gemini') ||
    searchableId.startsWith('x-ai/') ||
    searchableId.includes('grok')
  ) {
    return {
      badge: 'Protected thinking',
      detail: 'This family usually exposes summaries or protected reasoning blocks rather than a raw chain-of-thought transcript.',
      kind: 'protected',
    } as const
  }

  return {
    badge: 'Provider thinking',
    detail: 'This model supports reasoning, but the provider may expose live traces, summaries, or encrypted blocks depending on the backend.',
    kind: 'provider',
  } as const
}

function getModelCapabilityProfile(
  model: OpenRouterModel,
  statsEntry: OpenRouterModelStatsEntry | null,
) {
  const supportedParameters = new Set(
    (model.supported_parameters ?? []).map((value) => value.toLowerCase()),
  )
  const inputModalities = normalizeInputModalities(model)
  const outputModalities = normalizeOutputModalities(model)
  const supportsReasoning =
    supportedParameters.has('reasoning') ||
    supportedParameters.has('include_reasoning') ||
    supportedParameters.has('reasoning_effort')

  const capabilityProfile = {
    inputModalities,
    outputModalities,
    canInputText: inputModalities.includes('text'),
    canInputImage: inputModalities.includes('image'),
    canInputFile: inputModalities.includes('file'),
    canInputAudio: inputModalities.includes('audio'),
    canInputVideo: inputModalities.includes('video'),
    canOutputText: outputModalities.includes('text'),
    canOutputImage: outputModalities.includes('image'),
    canOutputAudio: outputModalities.includes('audio'),
    isMultimodal: inputModalities.length > 1 || outputModalities.length > 1,
    supportsReasoning,
    reasoningExposure: getReasoningExposure(model, supportsReasoning),
    supportsStructuredOutputs:
      supportedParameters.has('structured_outputs') ||
      supportedParameters.has('response_format'),
    supportsTools: supportedParameters.has('tools'),
  } satisfies Omit<OpenRouterModelCapabilityProfile, 'smartness'>

  return {
    ...capabilityProfile,
    smartness: getSmartnessProfile(model, statsEntry, capabilityProfile),
  } satisfies OpenRouterModelCapabilityProfile
}

function getInputCapabilityLabels(profile: OpenRouterModelCapabilityProfile) {
  const labels = ['Text']

  if (profile.canInputImage) {
    labels.push('Images')
  }

  if (profile.canInputFile) {
    labels.push('PDFs / files')
  }

  if (profile.canInputAudio) {
    labels.push('Audio')
  }

  if (profile.canInputVideo) {
    labels.push('Video')
  }

  labels.push('Code / text files')

  return labels
}

function getOutputCapabilityLabels(profile: OpenRouterModelCapabilityProfile) {
  const labels: string[] = []

  if (profile.canOutputText) {
    labels.push('Text')
  }

  if (profile.canOutputImage) {
    labels.push('Images')
  }

  if (profile.canOutputAudio) {
    labels.push('Audio')
  }

  return labels
}

function getAttachmentSupportHint(profile: OpenRouterModelCapabilityProfile) {
  const supportedInputs = getInputCapabilityLabels(profile).join(', ')

  if (profile.canInputFile) {
    return `${supportedInputs}. Code and text files are inlined into the prompt as text.`
  }

  return `${supportedInputs}. PDFs are hidden for this model because its catalog metadata does not advertise file input.`
}

function looksLikeImageGenerationPrompt(value: string) {
  return /\b(image|generate|draw|illustrate|render|design|logo|poster|photo|picture|artwork|wallpaper|banner|diagram|mockup|thumbnail)\b/i.test(
    value,
  )
}

export {
  getAttachmentSupportHint,
  getInputCapabilityLabels,
  getModelCapabilityProfile,
  getOutputCapabilityLabels,
  looksLikeImageGenerationPrompt,
}

export type { OpenRouterModelCapabilityProfile, OpenRouterSmartnessProfile }
