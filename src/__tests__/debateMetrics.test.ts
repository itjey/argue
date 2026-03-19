import { describe, it, expect } from 'vitest'
import {
  calculateEstimatedCost,
  aggregateSessionMetrics,
  formatCost,
  formatLatency,
} from '../lib/debateMetrics'
import type { RoundMetrics } from '../lib/debateMetrics'

describe('calculateEstimatedCost', () => {
  it('returns 0 when usage is null', () => {
    expect(calculateEstimatedCost(null, undefined)).toBe(0)
  })

  it('returns 0 when pricing is undefined', () => {
    expect(calculateEstimatedCost({ prompt_tokens: 100, completion_tokens: 50 }, undefined)).toBe(0)
  })

  it('computes cost from token counts and pricing', () => {
    const usage = { prompt_tokens: 1000, completion_tokens: 500 }
    const pricing = { prompt: '0.00001', completion: '0.00002' }
    const cost = calculateEstimatedCost(usage, pricing as never)
    // 1000 * 0.00001 + 500 * 0.00002 = 0.01 + 0.01 = 0.02
    expect(cost).toBeCloseTo(0.02, 6)
  })

  it('handles zero token counts', () => {
    const pricing = { prompt: '0.00001', completion: '0.00002' }
    expect(calculateEstimatedCost({ prompt_tokens: 0, completion_tokens: 0 }, pricing as never)).toBe(0)
  })
})

describe('aggregateSessionMetrics', () => {
  it('sums tokens and costs across rounds', () => {
    const rounds: RoundMetrics[] = [
      {
        roundIndex: 0,
        roundLabel: 'Round 1',
        totalLatencyMs: 1000,
        participants: [
          { participantId: 'a', modelId: 'm1', roundIndex: 0, inputTokens: 100, outputTokens: 50, reasoningTokens: 0, latencyMs: 500, estimatedCost: 0.01 },
          { participantId: 'b', modelId: 'm2', roundIndex: 0, inputTokens: 200, outputTokens: 100, reasoningTokens: 0, latencyMs: 500, estimatedCost: 0.02 },
        ],
      },
      {
        roundIndex: 1,
        roundLabel: 'Round 2',
        totalLatencyMs: 800,
        participants: [
          { participantId: 'a', modelId: 'm1', roundIndex: 1, inputTokens: 150, outputTokens: 75, reasoningTokens: 0, latencyMs: 400, estimatedCost: 0.015 },
        ],
      },
    ]

    const session = aggregateSessionMetrics(rounds)
    expect(session.totalInputTokens).toBe(450)
    expect(session.totalOutputTokens).toBe(225)
    expect(session.totalEstimatedCost).toBeCloseTo(0.045, 6)
    expect(session.totalDurationMs).toBe(1800)
    expect(session.rounds).toHaveLength(2)
  })

  it('handles empty rounds array', () => {
    const session = aggregateSessionMetrics([])
    expect(session.totalInputTokens).toBe(0)
    expect(session.totalOutputTokens).toBe(0)
    expect(session.totalEstimatedCost).toBe(0)
    expect(session.totalDurationMs).toBe(0)
  })
})

describe('formatCost', () => {
  it('formats zero cost', () => {
    expect(formatCost(0)).toBe('$0.00')
  })

  it('formats very small costs', () => {
    expect(formatCost(0.0001)).toMatch(/^\$0\.0001/)
  })

  it('formats normal costs', () => {
    expect(formatCost(0.05)).toMatch(/^\$0\.050/)
  })
})

describe('formatLatency', () => {
  it('formats sub-second as ms', () => {
    expect(formatLatency(500)).toBe('500ms')
  })

  it('formats seconds with one decimal', () => {
    expect(formatLatency(2500)).toBe('2.5s')
  })
})
