import type { OpenRouterModel } from './openrouter'

type OpenRouterEndpointSnapshot = {
  id: string
  name: string
  providerName: string
  providerDisplayName: string
  providerSlug: string
  providerRegion: string | null
  contextLength: number | null
  maxPromptTokens: number | null
  maxCompletionTokens: number | null
  variant: string
  isFree: boolean
  isByok: boolean
  canAbort: boolean
  moderationRequired: boolean
  pricing: {
    prompt: number
    completion: number
    inputCacheRead: number
    webSearch: number
  }
  stats: {
    p50Throughput: number | null
    p75Throughput: number | null
    p90Throughput: number | null
    p95Throughput: number | null
    p99Throughput: number | null
    p50Latency: number | null
    p75Latency: number | null
    p90Latency: number | null
    p95Latency: number | null
    p99Latency: number | null
    requestCount: number | null
    windowMinutes: number | null
  }
}

type OpenRouterSeriesPoint = {
  x: string
  y: Record<string, number>
  volume?: Record<string, number>
}

type OpenRouterEffectivePricingSnapshot = {
  weightedInputPrice: number | null
  weightedOutputPrice: number | null
  providerNames: string[]
  providerSummaries: Array<{
    providerName: string
    effectiveInputPrice: number | null
    effectiveOutputPrice: number | null
    cacheHitRate: number | null
  }>
  inputChartData: OpenRouterSeriesPoint[]
  outputChartData: OpenRouterSeriesPoint[]
}

type OpenRouterActivityPoint = {
  date: string
  requestCount: number
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  cachedTokens: number
  toolCalls: number
}

type OpenRouterTopAppsSnapshot = {
  topApps: Array<{
    rank: number | null
    totalTokens: string
    totalRequests: number
    app: {
      title: string
      description: string
      originUrl: string | null
      mainUrl: string | null
      faviconUrl: string | null
      categories: string[]
    }
  }>
  activityChart: OpenRouterActivityPoint[]
}

type OpenRouterBenchmarkSnapshot = {
  aaId: string
  aaSlug: string
  aaName: string
  permaslug: string | null
  openrouterSlug: string | null
  lastUpdatedAt: number | null
  benchmarkData: {
    model_type?: string
    evaluations?: Record<string, number>
  } | null
  percentiles: {
    intelligence_percentile?: number
    coding_percentile?: number
    agentic_percentile?: number
  } | null
}

type OpenRouterModelStatsEntry = {
  id: string
  canonicalSlug: string
  endpointStats: OpenRouterEndpointSnapshot[]
  latencyComparison: OpenRouterSeriesPoint[]
  latencyE2EComparison: OpenRouterSeriesPoint[]
  throughputComparison: OpenRouterSeriesPoint[]
  toolCallErrorRate: OpenRouterSeriesPoint[]
  effectivePricing: OpenRouterEffectivePricingSnapshot | null
  topApps: OpenRouterTopAppsSnapshot
  uptimeRecent: Record<
    string,
    Array<{
      date: string
      uptime: number | null
    }>
  >
  uptimeGraphs: {
    overallGraphUrl: string | null
    comparisonGraphUrl: string | null
    finishReasonGraphUrl: string | null
  } | null
  benchmarks: OpenRouterBenchmarkSnapshot[]
}

type OpenRouterStatsSnapshot = {
  refreshedAt: string
  modelCount: number
  source: {
    modelsApi: string
    statsHost: string
  }
  models: OpenRouterModelStatsEntry[]
}

function getStatsSnapshotUrl() {
  return new URL(`${import.meta.env.BASE_URL}openrouter-stats.json`, window.location.origin)
    .toString()
}

async function fetchOpenRouterStatsSnapshot() {
  const response = await fetch(getStatsSnapshotUrl(), {
    cache: 'no-cache',
  })

  if (!response.ok) {
    throw new Error('The bundled OpenRouter stats snapshot could not be loaded.')
  }

  return (await response.json()) as OpenRouterStatsSnapshot
}

function resolveOpenRouterModelStats(
  snapshot: OpenRouterStatsSnapshot | null,
  model: OpenRouterModel | null,
) {
  if (!snapshot || !model) {
    return null
  }

  return (
    snapshot.models.find(
      (entry) =>
        entry.canonicalSlug === model.canonical_slug ||
        entry.canonicalSlug === model.id ||
        entry.id === model.id,
    ) ?? null
  )
}

export {
  fetchOpenRouterStatsSnapshot,
  resolveOpenRouterModelStats,
}

export type {
  OpenRouterActivityPoint,
  OpenRouterBenchmarkSnapshot,
  OpenRouterEffectivePricingSnapshot,
  OpenRouterEndpointSnapshot,
  OpenRouterModelStatsEntry,
  OpenRouterSeriesPoint,
  OpenRouterStatsSnapshot,
}
