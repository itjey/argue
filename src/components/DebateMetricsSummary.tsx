import {
  aggregateSessionMetrics,
  formatCost,
  formatLatency,
  type RoundMetrics,
} from '../lib/debateMetrics'

interface DebateMetricsSummaryProps {
  rounds: RoundMetrics[]
}

function DebateMetricsSummary({ rounds }: DebateMetricsSummaryProps) {
  if (rounds.length === 0) return null

  const session = aggregateSessionMetrics(rounds)

  // Aggregate per-model totals
  const modelTotals = new Map<string, { modelId: string; inputTokens: number; outputTokens: number; cost: number; latencyMs: number; callCount: number }>()

  for (const round of rounds) {
    for (const p of round.participants) {
      const existing = modelTotals.get(p.modelId) ?? {
        modelId: p.modelId,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        latencyMs: 0,
        callCount: 0,
      }
      existing.inputTokens += p.inputTokens
      existing.outputTokens += p.outputTokens
      existing.cost += p.estimatedCost
      existing.latencyMs += p.latencyMs
      existing.callCount += 1
      modelTotals.set(p.modelId, existing)
    }
  }

  return (
    <div className="debate-metrics-summary">
      <div className="debate-metrics-header">
        <span className="debate-metrics-title">Session Metrics</span>
      </div>

      <div className="debate-metrics-totals">
        <div className="debate-metrics-stat">
          <span className="debate-metrics-stat-label">Total input tokens</span>
          <strong>{session.totalInputTokens.toLocaleString()}</strong>
        </div>
        <div className="debate-metrics-stat">
          <span className="debate-metrics-stat-label">Total output tokens</span>
          <strong>{session.totalOutputTokens.toLocaleString()}</strong>
        </div>
        <div className="debate-metrics-stat">
          <span className="debate-metrics-stat-label">Estimated cost</span>
          <strong>{formatCost(session.totalEstimatedCost)}</strong>
        </div>
        <div className="debate-metrics-stat">
          <span className="debate-metrics-stat-label">Total duration</span>
          <strong>{formatLatency(session.totalDurationMs)}</strong>
        </div>
      </div>

      {modelTotals.size > 0 && (
        <table className="debate-metrics-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Input</th>
              <th>Output</th>
              <th>Cost</th>
              <th>Avg Latency</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(modelTotals.values()).map((m) => (
              <tr key={m.modelId}>
                <td className="debate-metrics-model-id">{m.modelId}</td>
                <td>{m.inputTokens.toLocaleString()}</td>
                <td>{m.outputTokens.toLocaleString()}</td>
                <td>{formatCost(m.cost)}</td>
                <td>{formatLatency(Math.round(m.latencyMs / m.callCount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export { DebateMetricsSummary }
