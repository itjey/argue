import { useMemo, useState } from 'react'
import {
  AreaChart,
  Clock3,
  Gauge,
  Medal,
  Rocket,
  Sparkles,
} from 'lucide-react'
import { formatOpenRouterPrice } from '../lib/openrouter'
import type {
  OpenRouterBenchmarkSnapshot,
  OpenRouterModelStatsEntry,
  OpenRouterSeriesPoint,
} from '../lib/openrouterStats'

type ModelStatsPanelProps = {
  modelName: string
  snapshotRefreshedAt: string | null
  statsEntry: OpenRouterModelStatsEntry | null
  statsError: string
  statsLoading: boolean
}

const CHART_COLORS = ['#f5f5f2', '#d2d2cd', '#9f9f99', '#6f6f69']

function formatCompactNumber(value?: number) {
  if (!value) {
    return '0'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatSnapshotDate(value: string | null) {
  if (!value) {
    return 'Unknown'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatShortDate(value: string) {
  const date = new Date(value.replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatMilliseconds(value?: number | null) {
  if (value == null) {
    return 'n/a'
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`
  }

  return `${Math.round(value)} ms`
}

function formatPercent(value?: number | null) {
  if (value == null) {
    return 'n/a'
  }

  return `${value.toFixed(1)}%`
}

function formatRatioPercent(value?: number | null) {
  if (value == null) {
    return 'n/a'
  }

  return `${(value * 100).toFixed(1)}%`
}

function topSeriesNames(
  data: OpenRouterSeriesPoint[],
  limit = 4,
  preferredNames?: string[],
) {
  if (preferredNames?.length) {
    return preferredNames
  }

  const totals = new Map<string, number>()

  for (const point of data) {
    for (const [seriesName, value] of Object.entries(point.y)) {
      totals.set(seriesName, (totals.get(seriesName) ?? 0) + value)
    }
  }

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([seriesName]) => seriesName)
}

type StatsChartCardProps = {
  title: string
  subtitle: string
  data: OpenRouterSeriesPoint[]
  formatValue: (value: number) => string
  preferredSeries?: string[]
  unitLabel?: string
}

function StatsChartCard({
  title,
  subtitle,
  data,
  formatValue,
  preferredSeries,
  unitLabel,
}: StatsChartCardProps) {
  const seriesNames = useMemo(
    () => topSeriesNames(data, 4, preferredSeries),
    [data, preferredSeries],
  )

  const values = useMemo(
    () =>
      seriesNames.flatMap((seriesName) =>
        data
          .map((point) => point.y[seriesName])
          .filter((value): value is number => Number.isFinite(value)),
      ),
    [data, seriesNames],
  )

  if (seriesNames.length === 0 || values.length === 0) {
    return null
  }

  const width = 720
  const height = 228
  const padding = 18
  const minX = padding
  const maxX = width - padding
  const minY = padding
  const maxY = height - 30
  const yMax = Math.max(...values, 1)

  function xPosition(index: number) {
    if (data.length <= 1) {
      return width / 2
    }

    return minX + (index / (data.length - 1)) * (maxX - minX)
  }

  function yPosition(value: number) {
    const safeValue = value / yMax
    return maxY - safeValue * (maxY - minY)
  }

  return (
    <article className="control-card model-stats-card">
      <div className="model-stats-card-header">
        <div>
          <p className="model-stats-eyebrow">{title}</p>
          <h4>{subtitle}</h4>
        </div>
        {unitLabel ? <span className="model-stats-unit">{unitLabel}</span> : null}
      </div>

      <div className="stats-chart">
        <svg
          aria-label={`${subtitle} chart`}
          className="stats-chart-svg"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = minY + (maxY - minY) * ratio
            return (
              <line
                key={ratio}
                x1={minX}
                x2={maxX}
                y1={y}
                y2={y}
                className="stats-chart-grid"
              />
            )
          })}

          {seriesNames.map((seriesName, seriesIndex) => {
            const points = data
              .map((point, pointIndex) => {
                const value = point.y[seriesName]

                if (!Number.isFinite(value)) {
                  return null
                }

                return `${xPosition(pointIndex)},${yPosition(value)}`
              })
              .filter(Boolean)
              .join(' ')

            return (
              <g key={seriesName}>
                <polyline
                  className="stats-chart-line"
                  points={points}
                  style={{ stroke: CHART_COLORS[seriesIndex % CHART_COLORS.length] }}
                />
                {data.map((point, pointIndex) => {
                  const value = point.y[seriesName]

                  if (!Number.isFinite(value)) {
                    return null
                  }

                  return (
                    <circle
                      key={`${seriesName}-${point.x}`}
                      className="stats-chart-dot"
                      cx={xPosition(pointIndex)}
                      cy={yPosition(value)}
                      r="3.5"
                      style={{ fill: CHART_COLORS[seriesIndex % CHART_COLORS.length] }}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>

        <div className="stats-chart-axis">
          <span>{formatShortDate(data[0]?.x ?? '')}</span>
          <span>{formatValue(yMax)}</span>
          <span>{formatShortDate(data[data.length - 1]?.x ?? '')}</span>
        </div>
      </div>

      <div className="stats-chart-legend">
        {seriesNames.map((seriesName, seriesIndex) => {
          const latestValue = [...data]
            .reverse()
            .map((point) => point.y[seriesName])
            .find((value) => Number.isFinite(value))

          return (
            <div className="stats-chart-legend-item" key={seriesName}>
              <span
                className="stats-chart-swatch"
                style={{ backgroundColor: CHART_COLORS[seriesIndex % CHART_COLORS.length] }}
              />
              <div>
                <strong>{seriesName}</strong>
                <small>
                  {typeof latestValue === 'number' ? formatValue(latestValue) : 'n/a'}
                </small>
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function BenchmarkSection({ benchmarks }: { benchmarks: OpenRouterBenchmarkSnapshot[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (benchmarks.length === 0) {
    return null
  }

  const selectedBenchmark = benchmarks[Math.min(selectedIndex, benchmarks.length - 1)]
  const evaluations = Object.entries(selectedBenchmark.benchmarkData?.evaluations ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  )
  const maxEvaluation = Math.max(...evaluations.map(([, value]) => value), 1)

  return (
    <article className="control-card model-stats-card">
      <div className="model-stats-card-header">
        <div>
          <p className="model-stats-eyebrow">Benchmarks</p>
          <h4>Artificial Analysis benchmark profile</h4>
        </div>
        <Medal size={18} />
      </div>

      {benchmarks.length > 1 ? (
        <div className="stats-pill-row">
          {benchmarks.map((benchmark, index) => (
            <button
              className={`stats-pill ${
                index === selectedIndex ? 'stats-pill-active' : ''
              }`}
              key={benchmark.aaId}
              onClick={() => setSelectedIndex(index)}
              type="button"
            >
              {benchmark.aaName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="stats-mini-grid">
        <div className="stats-mini-card">
          <span>Intelligence</span>
          <strong>
            {selectedBenchmark.percentiles?.intelligence_percentile ?? 'n/a'}
          </strong>
        </div>
        <div className="stats-mini-card">
          <span>Coding</span>
          <strong>{selectedBenchmark.percentiles?.coding_percentile ?? 'n/a'}</strong>
        </div>
        <div className="stats-mini-card">
          <span>Agentic</span>
          <strong>{selectedBenchmark.percentiles?.agentic_percentile ?? 'n/a'}</strong>
        </div>
      </div>

      <div className="stats-benchmark-list">
        {evaluations.map(([label, value]) => (
          <div className="stats-benchmark-row" key={label}>
            <div className="stats-benchmark-copy">
              <span>{label.replaceAll('_', ' ')}</span>
              <strong>{value.toFixed(3)}</strong>
            </div>
            <div className="stats-benchmark-track">
              <div
                className="stats-benchmark-bar"
                style={{
                  width: `${Math.max(6, Math.min(100, (value / maxEvaluation) * 100))}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function ModelStatsPanel({
  modelName,
  snapshotRefreshedAt,
  statsEntry,
  statsError,
  statsLoading,
}: ModelStatsPanelProps) {
  if (statsLoading) {
    return (
      <article className="control-card model-stats-card model-stats-empty">
        <p className="model-stats-eyebrow">OpenRouter stats</p>
        <h4>Loading the latest bundled performance snapshot.</h4>
      </article>
    )
  }

  if (statsError) {
    return (
      <article className="control-card model-stats-card model-stats-empty">
        <p className="model-stats-eyebrow">OpenRouter stats</p>
        <h4>{statsError}</h4>
      </article>
    )
  }

  if (!statsEntry) {
    return (
      <article className="control-card model-stats-card model-stats-empty">
        <p className="model-stats-eyebrow">OpenRouter stats</p>
        <h4>No bundled stats are available for this model yet.</h4>
        <p className="model-stats-copy">
          The live model catalog can move faster than the last deployed stats snapshot.
        </p>
      </article>
    )
  }

  const activitySeries = statsEntry.topApps.activityChart.map((point) => ({
    x: point.date,
    y: {
      Prompt: point.promptTokens,
      Completion: point.completionTokens,
      Reasoning: point.reasoningTokens,
    },
  }))

  const uptimeSummaries = statsEntry.endpointStats
    .map((endpoint) => {
      const points = statsEntry.uptimeRecent[endpoint.id] ?? []
      const latestPoint = points[0]

      return {
        endpointId: endpoint.id,
        providerName: endpoint.providerDisplayName,
        uptime: latestPoint?.uptime ?? null,
        date: latestPoint?.date ?? null,
      }
    })
    .filter((entry) => entry.providerName)

  return (
    <section className="model-stats-panel">
      <div className="control-card model-stats-card">
        <div className="model-stats-card-header">
          <div>
            <p className="model-stats-eyebrow">OpenRouter stats</p>
            <h4>Performance, pricing, apps, activity, and uptime for {modelName}</h4>
          </div>
          <Sparkles size={18} />
        </div>
        <p className="model-stats-copy">
          Bundled from OpenRouter&apos;s current stats endpoints at deploy time so the
          GitHub Pages app can show the same model context without sending users away.
        </p>
        <p className="model-stats-note">
          Snapshot refreshed {formatSnapshotDate(snapshotRefreshedAt)}.
        </p>
      </div>

      <div className="model-stats-grid">
        <StatsChartCard
          data={statsEntry.throughputComparison}
          formatValue={(value) => `${Math.round(value)} tok/s`}
          title="Performance"
          subtitle="Median throughput"
        />
        <StatsChartCard
          data={statsEntry.latencyComparison}
          formatValue={formatMilliseconds}
          title="Performance"
          subtitle="Median time to first token"
        />
        <StatsChartCard
          data={statsEntry.latencyE2EComparison}
          formatValue={formatMilliseconds}
          title="Performance"
          subtitle="Median end-to-end latency"
        />
        <StatsChartCard
          data={statsEntry.toolCallErrorRate}
          formatValue={formatPercent}
          title="Reliability"
          subtitle="Tool call error rate"
        />
      </div>

      {statsEntry.endpointStats.length > 0 ? (
        <article className="control-card model-stats-card">
          <div className="model-stats-card-header">
            <div>
              <p className="model-stats-eyebrow">Providers</p>
              <h4>Current provider performance snapshot</h4>
            </div>
            <Gauge size={18} />
          </div>

          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>TTFT</th>
                  <th>Throughput</th>
                  <th>Requests</th>
                  <th>Input</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {statsEntry.endpointStats.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td>
                      <strong>{endpoint.providerDisplayName}</strong>
                    </td>
                    <td>{formatMilliseconds(endpoint.stats.p50Latency)}</td>
                    <td>
                      {endpoint.stats.p50Throughput == null
                        ? 'n/a'
                        : `${Math.round(endpoint.stats.p50Throughput)} tok/s`}
                    </td>
                    <td>{formatCompactNumber(endpoint.stats.requestCount ?? 0)}</td>
                    <td>{formatOpenRouterPrice(String(endpoint.pricing.prompt))}</td>
                    <td>{formatOpenRouterPrice(String(endpoint.pricing.completion))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {statsEntry.effectivePricing ? (
        <>
          <div className="stats-mini-grid">
            <div className="control-card model-stats-card stats-mini-summary">
              <p className="model-stats-eyebrow">Pricing</p>
              <strong>
                {formatOpenRouterPrice(
                  String(statsEntry.effectivePricing.weightedInputPrice ?? 0),
                )}
              </strong>
              <span>Weighted avg input price</span>
            </div>
            <div className="control-card model-stats-card stats-mini-summary">
              <p className="model-stats-eyebrow">Pricing</p>
              <strong>
                {formatOpenRouterPrice(
                  String(statsEntry.effectivePricing.weightedOutputPrice ?? 0),
                )}
              </strong>
              <span>Weighted avg output price</span>
            </div>
          </div>

          <div className="model-stats-grid">
            <StatsChartCard
              data={statsEntry.effectivePricing.inputChartData}
              formatValue={(value) => formatOpenRouterPrice(String(value))}
              title="Pricing"
              subtitle="Input price per 1M tokens"
            />
            <StatsChartCard
              data={statsEntry.effectivePricing.outputChartData}
              formatValue={(value) => formatOpenRouterPrice(String(value))}
              title="Pricing"
              subtitle="Output price per 1M tokens"
            />
          </div>

          {statsEntry.effectivePricing.providerSummaries.length > 0 ? (
            <article className="control-card model-stats-card">
              <div className="model-stats-card-header">
                <div>
                  <p className="model-stats-eyebrow">Pricing</p>
                  <h4>Provider-by-provider pricing snapshot</h4>
                </div>
                <AreaChart size={18} />
              </div>

              <div className="stats-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Cache hit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsEntry.effectivePricing.providerSummaries.map((provider) => (
                      <tr key={provider.providerName}>
                        <td>
                          <strong>{provider.providerName}</strong>
                        </td>
                        <td>
                          {formatOpenRouterPrice(
                            String(provider.effectiveInputPrice ?? 0),
                          )}
                        </td>
                        <td>
                          {formatOpenRouterPrice(
                            String(provider.effectiveOutputPrice ?? 0),
                          )}
                        </td>
                        <td>{formatRatioPercent(provider.cacheHitRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
        </>
      ) : null}

      {statsEntry.topApps.activityChart.length > 0 ? (
        <StatsChartCard
          data={activitySeries}
          formatValue={formatCompactNumber}
          preferredSeries={['Prompt', 'Completion', 'Reasoning']}
          title="Activity"
          subtitle="Daily token activity on OpenRouter"
          unitLabel={`${formatCompactNumber(
            statsEntry.topApps.activityChart.reduce(
              (total, point) => total + point.requestCount,
              0,
            ),
          )} requests`}
        />
      ) : null}

      {statsEntry.topApps.topApps.length > 0 ? (
        <article className="control-card model-stats-card">
          <div className="model-stats-card-header">
            <div>
              <p className="model-stats-eyebrow">Apps</p>
              <h4>Top public apps using this model</h4>
            </div>
            <Rocket size={18} />
          </div>

          <div className="stats-app-grid">
            {statsEntry.topApps.topApps.slice(0, 6).map((entry) => (
              <article className="stats-app-card" key={`${entry.rank}-${entry.app.title}`}>
                <div className="stats-app-rank">{entry.rank}</div>
                <div>
                  <h5>{entry.app.title}</h5>
                  <p>{entry.app.description || 'Public OpenRouter app usage'}</p>
                  <div className="stats-app-meta">
                    <span>{formatCompactNumber(Number(entry.totalTokens))} tokens</span>
                    <span>{formatCompactNumber(entry.totalRequests)} requests</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      <BenchmarkSection benchmarks={statsEntry.benchmarks} key={statsEntry.id} />

      {(statsEntry.uptimeGraphs?.comparisonGraphUrl ||
        statsEntry.uptimeGraphs?.overallGraphUrl ||
        statsEntry.uptimeGraphs?.finishReasonGraphUrl) && (
        <article className="control-card model-stats-card">
          <div className="model-stats-card-header">
            <div>
              <p className="model-stats-eyebrow">Uptime</p>
              <h4>Embedded OpenRouter uptime graphs</h4>
            </div>
            <Clock3 size={18} />
          </div>

          <div className="stats-frame-grid">
            {statsEntry.uptimeGraphs?.comparisonGraphUrl ? (
              <iframe
                className="stats-graph-frame"
                loading="lazy"
                src={statsEntry.uptimeGraphs.comparisonGraphUrl}
                title={`${modelName} comparison uptime graph`}
              />
            ) : null}

            {statsEntry.uptimeGraphs?.overallGraphUrl ? (
              <iframe
                className="stats-graph-frame"
                loading="lazy"
                src={statsEntry.uptimeGraphs.overallGraphUrl}
                title={`${modelName} uptime graph`}
              />
            ) : null}

            {statsEntry.uptimeGraphs?.finishReasonGraphUrl ? (
              <iframe
                className="stats-graph-frame"
                loading="lazy"
                src={statsEntry.uptimeGraphs.finishReasonGraphUrl}
                title={`${modelName} finish reason graph`}
              />
            ) : null}
          </div>

          {uptimeSummaries.length > 0 ? (
            <div className="stats-pill-row">
              {uptimeSummaries.map((summary) => (
                <div className="stats-pill stats-pill-static" key={summary.endpointId}>
                  <strong>{summary.providerName}</strong>
                  <span>{formatPercent(summary.uptime)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      )}

      {statsEntry.endpointStats.length === 0 &&
      statsEntry.topApps.topApps.length === 0 &&
      statsEntry.benchmarks.length === 0 ? (
        <article className="control-card model-stats-card model-stats-empty">
          <p className="model-stats-eyebrow">OpenRouter stats</p>
          <h4>This model does not have much public stats data yet.</h4>
          <p className="model-stats-copy">
            Newer or lower-traffic models can appear in the catalog before OpenRouter
            has enough provider telemetry, pricing history, or benchmark coverage.
          </p>
        </article>
      ) : null}
    </section>
  )
}

export { ModelStatsPanel }
