import type { OpenRouterModel } from './openrouter'

type ParticipantRoundMetrics = {
  participantId: string
  modelId: string
  roundIndex: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  latencyMs: number
  estimatedCost: number
}

type RoundMetrics = {
  roundIndex: number
  roundLabel: string
  participants: ParticipantRoundMetrics[]
  totalLatencyMs: number
}

type SessionMetrics = {
  rounds: RoundMetrics[]
  totalInputTokens: number
  totalOutputTokens: number
  totalEstimatedCost: number
  totalDurationMs: number
}

function calculateEstimatedCost(
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  pricing: OpenRouterModel['pricing'],
): number {
  if (!usage || !pricing) return 0

  const promptPrice = Number(pricing.prompt ?? '0')
  const completionPrice = Number(pricing.completion ?? '0')

  if (!Number.isFinite(promptPrice) || !Number.isFinite(completionPrice)) return 0

  const inputCost = (usage.prompt_tokens ?? 0) * promptPrice
  const outputCost = (usage.completion_tokens ?? 0) * completionPrice

  return inputCost + outputCost
}

function aggregateSessionMetrics(rounds: RoundMetrics[]): SessionMetrics {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalEstimatedCost = 0
  let totalDurationMs = 0

  for (const round of rounds) {
    totalDurationMs += round.totalLatencyMs

    for (const p of round.participants) {
      totalInputTokens += p.inputTokens
      totalOutputTokens += p.outputTokens
      totalEstimatedCost += p.estimatedCost
    }
  }

  return {
    rounds,
    totalInputTokens,
    totalOutputTokens,
    totalEstimatedCost,
    totalDurationMs,
  }
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.001) return `$${cost.toFixed(6)}`
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export {
  aggregateSessionMetrics,
  calculateEstimatedCost,
  formatCost,
  formatLatency,
}

export type {
  ParticipantRoundMetrics,
  RoundMetrics,
  SessionMetrics,
}
