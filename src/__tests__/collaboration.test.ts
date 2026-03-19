import { describe, it, expect } from 'vitest'
import { extractTag, parseRoundOutput, participantSystemPrompt, determineVoteWinner } from '../lib/collaboration'

describe('extractTag', () => {
  it('extracts content between matching tags', () => {
    const text = '<answer>Hello world</answer>'
    expect(extractTag(text, 'answer')).toBe('Hello world')
  })

  it('returns empty string when tag not found', () => {
    expect(extractTag('no tags here', 'answer')).toBe('')
  })

  it('handles whitespace inside tags', () => {
    const text = '< answer >  Some text  </ answer >'
    expect(extractTag(text, 'answer')).toBe('Some text')
  })

  it('is case-insensitive', () => {
    const text = '<ANSWER>Test</ANSWER>'
    expect(extractTag(text, 'answer')).toBe('Test')
  })

  it('extracts multiline content', () => {
    const text = '<reasoning>\nLine 1\nLine 2\n</reasoning>'
    expect(extractTag(text, 'reasoning')).toBe('Line 1\nLine 2')
  })
})

describe('parseRoundOutput', () => {
  it('extracts multiple tags', () => {
    const text = '<answer>42</answer><confidence>85</confidence>'
    const result = parseRoundOutput(text, ['answer', 'confidence'])
    expect(result.answer).toBe('42')
    expect(result.confidence).toBe(85)
  })

  it('clamps confidence to 0–100', () => {
    const text = '<confidence>150</confidence>'
    const result = parseRoundOutput(text, ['confidence'])
    expect(result.confidence).toBe(100)
  })

  it('normalizes winner to uppercase', () => {
    const text = '<winner>model a</winner>'
    const result = parseRoundOutput(text, ['winner'])
    expect(result.winner).toBe('MODEL A')
  })
})

describe('participantSystemPrompt', () => {
  it('produces a prompt containing the role', () => {
    const prompt = participantSystemPrompt({ id: 'test', modelId: 'test/m', role: 'Analyst', alias: 'A' })
    expect(prompt).toContain('Analyst')
  })

  it('accepts a custom participantCount', () => {
    const prompt = participantSystemPrompt({ id: 'test', modelId: 'test/m', role: 'Builder', alias: 'B' }, 5)
    expect(prompt).toContain('5-model')
  })

  it('defaults to 3-model when no count given', () => {
    const prompt = participantSystemPrompt({ id: 'test', modelId: 'test/m', role: 'Critic', alias: 'C' })
    expect(prompt).toContain('3-model')
  })
})

describe('determineVoteWinner', () => {
  it('returns the model with most votes', () => {
    const records = [
      { participant: 'A', output: '', parsed: { selected_candidate: 'MODEL_B' } },
      { participant: 'B', output: '', parsed: { selected_candidate: 'MODEL_B' } },
      { participant: 'C', output: '', parsed: { selected_candidate: 'MODEL_A' } },
    ]
    const result = determineVoteWinner(records as never[])
    expect(result.winner).toBe('MODEL_B')
  })
})
