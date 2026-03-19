import { MarkdownBlock } from './RichMessageContent'
import { formatCost, formatLatency, type RoundMetrics } from '../lib/debateMetrics'
import type { RoundStage } from '../lib/debateEngine'

interface DebateRoundDisplayProps {
  stage: RoundStage
  roundMetrics: RoundMetrics
  participantOutputs: Map<string, { content: string; reasoning?: string; alias: string; role: string; status: 'pending' | 'thinking' | 'done' }>
  defaultOpen?: boolean
}

const STAGE_LABELS: Record<RoundStage, string> = {
  independent: 'Independent Analysis',
  'self-critique': 'Self-Critique',
  'cross-critique': 'Cross-Critique',
  revision: 'Revision',
  audit: 'Audit',
  vote: 'Vote',
  synthesis: 'Synthesis',
}

function DebateRoundDisplay({ stage, roundMetrics, participantOutputs, defaultOpen }: DebateRoundDisplayProps) {
  const doneCount = Array.from(participantOutputs.values()).filter((p) => p.status === 'done').length
  const totalCount = participantOutputs.size

  return (
    <details className="group-phase-details" open={defaultOpen}>
      <summary className="group-phase-summary">
        <span className="group-phase-label">{STAGE_LABELS[stage] ?? stage}</span>
        <span className="group-phase-meta">
          {doneCount}/{totalCount} models · {formatLatency(roundMetrics.totalLatencyMs)}
        </span>
      </summary>
      <div className="group-phase-runs">
        {Array.from(participantOutputs.entries()).map(([participantId, output]) => {
          const metrics = roundMetrics.participants.find((p) => p.participantId === participantId)

          return (
            <div key={participantId} className={`group-run group-run-${output.status}`}>
              <div className="group-run-header">
                <span className="group-run-model">{output.alias}</span>
                <span className="group-run-role">{output.role}</span>
                {output.status === 'thinking' && (
                  <span className="chat-thinking-pulse group-run-thinking">thinking…</span>
                )}
                {metrics && (
                  <span className="group-run-time">
                    {formatLatency(metrics.latencyMs)} · {metrics.inputTokens + metrics.outputTokens} tokens · {formatCost(metrics.estimatedCost)}
                  </span>
                )}
              </div>

              {output.reasoning && (
                <details className="chat-thinking-row">
                  <summary className="chat-thinking-toggle">
                    <span>Reasoning trace</span>
                  </summary>
                  <div className="chat-thinking-content">
                    <MarkdownBlock>{output.reasoning}</MarkdownBlock>
                  </div>
                </details>
              )}

              {output.content && <MarkdownBlock>{output.content}</MarkdownBlock>}
            </div>
          )
        })}
      </div>
    </details>
  )
}

export { DebateRoundDisplay }
