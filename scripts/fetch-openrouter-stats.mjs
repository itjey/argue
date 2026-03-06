import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_STATS_BASE_URL = 'https://openrouter.ai'
const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'openrouter-stats.json',
)
const REQUEST_CONCURRENCY = 8

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'argue-openrouter-stats-refresh',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(
      `${response.status} ${response.statusText} for ${url}${errorBody ? `: ${errorBody.slice(0, 240)}` : ''}`,
    )
  }

  return response.json()
}

async function fetchOptionalJson(url) {
  try {
    return await fetchJson(url)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown request failure',
    }
  }
}

function sanitizeEndpointStats(payload) {
  if (!Array.isArray(payload?.data)) {
    return []
  }

  return payload.data.map((endpoint) => ({
    id: endpoint.id,
    name: endpoint.name,
    providerName: endpoint.provider_name ?? endpoint.provider_display_name ?? 'Unknown',
    providerDisplayName:
      endpoint.provider_display_name ?? endpoint.provider_name ?? 'Unknown',
    providerSlug: endpoint.provider_slug ?? '',
    providerRegion: endpoint.provider_region ?? null,
    contextLength: endpoint.context_length ?? null,
    maxPromptTokens: endpoint.max_prompt_tokens ?? null,
    maxCompletionTokens: endpoint.max_completion_tokens ?? null,
    variant: endpoint.variant ?? 'standard',
    isFree: Boolean(endpoint.is_free),
    isByok: Boolean(endpoint.is_byok),
    canAbort: Boolean(endpoint.can_abort),
    moderationRequired: Boolean(endpoint.moderation_required),
    pricing: {
      prompt: Number(endpoint.pricing?.prompt ?? 0),
      completion: Number(endpoint.pricing?.completion ?? 0),
      inputCacheRead: Number(endpoint.pricing?.input_cache_read ?? 0),
      webSearch: Number(endpoint.pricing?.web_search ?? 0),
    },
    stats: {
      p50Throughput: endpoint.stats?.p50_throughput ?? null,
      p75Throughput: endpoint.stats?.p75_throughput ?? null,
      p90Throughput: endpoint.stats?.p90_throughput ?? null,
      p95Throughput: endpoint.stats?.p95_throughput ?? null,
      p99Throughput: endpoint.stats?.p99_throughput ?? null,
      p50Latency: endpoint.stats?.p50_latency ?? null,
      p75Latency: endpoint.stats?.p75_latency ?? null,
      p90Latency: endpoint.stats?.p90_latency ?? null,
      p95Latency: endpoint.stats?.p95_latency ?? null,
      p99Latency: endpoint.stats?.p99_latency ?? null,
      requestCount: endpoint.stats?.request_count ?? null,
      windowMinutes: endpoint.stats?.window_minutes ?? null,
    },
  }))
}

function sanitizeSeries(payload, includeVolume = false) {
  if (!Array.isArray(payload?.data)) {
    return []
  }

  return payload.data.map((point) => ({
    x: point.x,
    y: point.y ?? {},
    ...(includeVolume ? { volume: point.volume ?? {} } : {}),
  }))
}

function sanitizeEffectivePricing(payload) {
  if (!payload?.data) {
    return null
  }

  return {
    weightedInputPrice: payload.data.weightedInputPrice ?? null,
    weightedOutputPrice: payload.data.weightedOutputPrice ?? null,
    providerNames: Array.isArray(payload.data.providerNames)
      ? payload.data.providerNames
      : [],
    providerSummaries: Array.isArray(payload.data.providerSummaries)
      ? payload.data.providerSummaries.map((provider) => ({
          providerName: provider.providerName,
          effectiveInputPrice: provider.effectiveInputPrice ?? null,
          effectiveOutputPrice: provider.effectiveOutputPrice ?? null,
          cacheHitRate: provider.cacheHitRate ?? null,
        }))
      : [],
    inputChartData: sanitizeSeries({ data: payload.data.inputChartData }),
    outputChartData: sanitizeSeries({ data: payload.data.outputChartData }),
  }
}

function sanitizeTopApps(payload) {
  if (!payload?.data) {
    return {
      topApps: [],
      activityChart: [],
    }
  }

  return {
    topApps: Array.isArray(payload.data.top_apps)
      ? payload.data.top_apps.map((entry) => ({
          rank: entry.rank ?? null,
          totalTokens: entry.total_tokens ?? '0',
          totalRequests: entry.total_requests ?? 0,
          app: {
            title: entry.app?.title ?? 'Unknown app',
            description: entry.app?.description ?? '',
            originUrl: entry.app?.origin_url ?? null,
            mainUrl: entry.app?.main_url ?? null,
            faviconUrl: entry.app?.favicon_url ?? null,
            categories: Array.isArray(entry.app?.categories) ? entry.app.categories : [],
          },
        }))
      : [],
    activityChart: Array.isArray(payload.data.top_apps_chart)
      ? payload.data.top_apps_chart.map((point) => ({
          date: point.date,
          requestCount: point.count ?? 0,
          promptTokens: point.total_prompt_tokens ?? 0,
          completionTokens: point.total_completion_tokens ?? 0,
          reasoningTokens: point.total_native_tokens_reasoning ?? 0,
          cachedTokens: point.total_native_tokens_cached ?? 0,
          toolCalls: point.total_tool_calls ?? 0,
        }))
      : [],
  }
}

function sanitizeUptimeRecent(payload) {
  if (!payload?.data || typeof payload.data !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(payload.data).map(([endpointId, values]) => [
      endpointId,
      Array.isArray(values)
        ? values.map((point) => ({
            date: point.date,
            uptime: point.uptime ?? null,
          }))
        : [],
    ]),
  )
}

function sanitizeUptimeGraphs(payload) {
  if (!payload?.data) {
    return null
  }

  return {
    overallGraphUrl: payload.data.overallGraphUrl ?? null,
    comparisonGraphUrl: payload.data.comparisonGraphUrl ?? null,
    finishReasonGraphUrl: payload.data.finishReasonGraphUrl ?? null,
  }
}

function sanitizeBenchmarks(payload) {
  if (!Array.isArray(payload?.data)) {
    return []
  }

  return payload.data.map((entry) => ({
    aaId: entry.aa_id,
    aaSlug: entry.aa_slug,
    aaName: entry.aa_name,
    permaslug: entry.permaslug ?? null,
    openrouterSlug: entry.openrouter_slug ?? entry.heuristic_openrouter_slug ?? null,
    lastUpdatedAt: entry.last_updated_at ?? null,
    benchmarkData: entry.benchmark_data ?? null,
    percentiles: entry.percentiles ?? null,
  }))
}

function resolveCanonicalSlug(model) {
  return model.canonical_slug || model.id
}

async function resolveBenchmarkData(model) {
  const candidates = unique([
    model.id,
    model.canonical_slug,
    model.id?.split('/')[1],
    model.canonical_slug?.split('/')[1],
  ])

  for (const slug of candidates) {
    const payload = await fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/internal/v1/artificial-analysis-benchmarks?slug=${encodeURIComponent(slug)}`,
    )

    if (Array.isArray(payload?.data) && payload.data.length > 0) {
      return sanitizeBenchmarks(payload)
    }
  }

  return []
}

async function fetchModelStats(model) {
  const permaslug = resolveCanonicalSlug(model)
  const encodedPermaslug = encodeURIComponent(permaslug)

  const [
    endpointPayload,
    latencyPayload,
    latencyE2EPayload,
    throughputPayload,
    toolErrorsPayload,
    pricingPayload,
    topAppsPayload,
    uptimeRecentPayload,
    uptimeGraphsPayload,
    benchmarks,
  ] = await Promise.all([
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/endpoint?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/latency-comparison?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/latency-e2e-comparison?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/throughput-comparison?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/tool-call-error-rate?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/effective-pricing?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/top-apps-for-model?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/stats/uptime-recent?permaslug=${encodedPermaslug}`,
    ),
    fetchOptionalJson(
      `${OPENROUTER_STATS_BASE_URL}/api/frontend/uptime-graphs?permaslug=${encodedPermaslug}`,
    ),
    resolveBenchmarkData(model),
  ])

  return {
    id: model.id,
    canonicalSlug: permaslug,
    endpointStats: sanitizeEndpointStats(endpointPayload),
    latencyComparison: sanitizeSeries(latencyPayload),
    latencyE2EComparison: sanitizeSeries(latencyE2EPayload),
    throughputComparison: sanitizeSeries(throughputPayload),
    toolCallErrorRate: sanitizeSeries(toolErrorsPayload, true),
    effectivePricing: sanitizeEffectivePricing(pricingPayload),
    topApps: sanitizeTopApps(topAppsPayload),
    uptimeRecent: sanitizeUptimeRecent(uptimeRecentPayload),
    uptimeGraphs: sanitizeUptimeGraphs(uptimeGraphsPayload),
    benchmarks,
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
      await sleep(15)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  )

  return results
}

async function main() {
  console.log('Fetching OpenRouter model catalog...')
  const modelsPayload = await fetchJson(OPENROUTER_MODELS_URL)
  const models = Array.isArray(modelsPayload?.data) ? modelsPayload.data : []

  console.log(`Refreshing stats for ${models.length} models...`)
  const stats = await mapWithConcurrency(models, REQUEST_CONCURRENCY, async (model, index) => {
    const entry = await fetchModelStats(model)
    const progressLabel = `${index + 1}/${models.length}`.padEnd(12)
    console.log(`${progressLabel} ${model.id}`)
    return entry
  })

  const output = {
    refreshedAt: new Date().toISOString(),
    modelCount: models.length,
    source: {
      modelsApi: OPENROUTER_MODELS_URL,
      statsHost: OPENROUTER_STATS_BASE_URL,
    },
    models: stats,
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, JSON.stringify(output))

  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
