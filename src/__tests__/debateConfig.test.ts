import { describe, it, expect } from 'vitest'
import { validateDebateConfig, DEFAULT_DEBATE_CONFIG } from '../lib/debateConfig'
import type { DebateConfig } from '../lib/debateConfig'

describe('validateDebateConfig', () => {
  it('accepts the default config', () => {
    const errors = validateDebateConfig(DEFAULT_DEBATE_CONFIG)
    expect(errors).toHaveLength(0)
  })

  it('rejects fewer than 2 participants', () => {
    const config: DebateConfig = {
      ...DEFAULT_DEBATE_CONFIG,
      participants: [DEFAULT_DEBATE_CONFIG.participants[0]],
    }
    const errors = validateDebateConfig(config)
    expect(errors.some((e) => e.includes('2 participants'))).toBe(true)
  })

  it('rejects roundCount of 0', () => {
    const config: DebateConfig = { ...DEFAULT_DEBATE_CONFIG, roundCount: 0 }
    const errors = validateDebateConfig(config)
    expect(errors.some((e) => e.includes('Round count'))).toBe(true)
  })

  it('rejects roundCount above 5', () => {
    const config: DebateConfig = { ...DEFAULT_DEBATE_CONFIG, roundCount: 6 }
    const errors = validateDebateConfig(config)
    expect(errors.some((e) => e.includes('Round count'))).toBe(true)
  })

  it('rejects participant with empty modelId', () => {
    const config: DebateConfig = {
      ...DEFAULT_DEBATE_CONFIG,
      participants: [
        { ...DEFAULT_DEBATE_CONFIG.participants[0], modelId: '' },
        DEFAULT_DEBATE_CONFIG.participants[1],
      ],
    }
    const errors = validateDebateConfig(config)
    expect(errors.some((e) => e.includes('no model selected'))).toBe(true)
  })

  it('rejects empty judgeModelId', () => {
    const config: DebateConfig = { ...DEFAULT_DEBATE_CONFIG, judgeModelId: '' }
    const errors = validateDebateConfig(config)
    expect(errors.some((e) => e.includes('judge model'))).toBe(true)
  })
})

describe('DEFAULT_DEBATE_CONFIG', () => {
  it('has at least 2 participants', () => {
    expect(DEFAULT_DEBATE_CONFIG.participants.length).toBeGreaterThanOrEqual(2)
  })

  it('has valid roundCount', () => {
    expect(DEFAULT_DEBATE_CONFIG.roundCount).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_DEBATE_CONFIG.roundCount).toBeLessThanOrEqual(5)
  })

  it('has a judgeModelId set', () => {
    expect(DEFAULT_DEBATE_CONFIG.judgeModelId).toBeTruthy()
  })
})
