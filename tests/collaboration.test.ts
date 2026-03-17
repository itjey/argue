import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateAuditScores,
  determineVoteWinner,
  parseRoundOutput,
  type CollaborationRoundRecord,
} from '../src/lib/collaboration.ts'

const participantA = {
  id: 'gpt',
  alias: 'GPT-5.4',
  role: 'verifier',
  modelId: 'openai/gpt-5.4',
}

const participantB = {
  id: 'gemini',
  alias: 'Gemini 3.1',
  role: 'reasoner',
  modelId: 'google/gemini-3.1-pro-preview',
}

function createRecord(
  participant: typeof participantA,
  rawOutput: string,
  parsed: CollaborationRoundRecord['parsed'],
): CollaborationRoundRecord {
  return {
    participant,
    rawOutput,
    parsed,
  }
}

test('parseRoundOutput tolerates spaced tag names and normalizes confidence', () => {
  const parsed = parseRoundOutput(
    [
      '<draft_answer>42</draft_answer>',
      '<confidence> 91 / 100 </confidence>',
      '<key_points>Checked twice</key_points>',
      '<confidence _ after _ self _ critique>83</confidence _ after _ self _ critique>',
    ].join('\n'),
    [
      'draft_answer',
      'confidence',
      'key_points',
      'confidence_after_self_critique',
    ],
  )

  assert.equal(parsed.draft_answer, '42')
  assert.equal(parsed.confidence, 91)
  assert.equal(parsed.key_points, 'Checked twice')
  assert.equal(parsed.confidence_after_self_critique, 83)
})

test('aggregateAuditScores penalizes fatal flaws and picks the best candidate', () => {
  const revisedRecords: CollaborationRoundRecord[] = [
    createRecord(participantA, '<revised_answer>Answer A</revised_answer>', {
      revised_answer: 'Answer A',
    }),
    createRecord(participantB, '<revised_answer>Answer B</revised_answer>', {
      revised_answer: 'Answer B',
    }),
  ]

  const auditRecords: CollaborationRoundRecord[] = [
    createRecord(participantA, '<scorecard>...</scorecard>', {
      scorecard: {
        C1: {
          correctness: 8,
          completeness: 7,
          robustness: 8,
          fatal_flaw: 'NONE',
        },
        C2: {
          correctness: 7,
          completeness: 6,
          robustness: 6,
          fatal_flaw: 'Arithmetic error',
        },
      },
    }),
    createRecord(participantB, '<scorecard>...</scorecard>', {
      scorecard: {
        C1: {
          correctness: 9,
          completeness: 8,
          robustness: 8,
          fatal_flaw: 'NONE',
        },
        C2: {
          correctness: 8,
          completeness: 7,
          robustness: 7,
          fatal_flaw: 'NONE',
        },
      },
    }),
  ]

  const summary = aggregateAuditScores(auditRecords, revisedRecords)

  assert.equal(summary.winner, 'C1')
  assert.ok((summary.totals.C1 ?? 0) > (summary.totals.C2 ?? 0))
  assert.deepEqual(summary.fatalFlaws.C2, ['Arithmetic error'])
})

test('determineVoteWinner counts selected candidates', () => {
  const votes: CollaborationRoundRecord[] = [
    createRecord(participantA, '<selected_candidate>C1</selected_candidate>', {
      selected_candidate: 'C1',
    }),
    createRecord(participantB, '<selected_candidate>MERGED</selected_candidate>', {
      selected_candidate: 'MERGED',
    }),
    createRecord(
      {
        id: 'deepseek',
        alias: 'DeepSeek R1',
        role: 'critic',
        modelId: 'deepseek/deepseek-r1',
      },
      '<selected_candidate>C1</selected_candidate>',
      {
        selected_candidate: 'C1',
      },
    ),
  ]

  const result = determineVoteWinner(votes)

  assert.equal(result.winner, 'C1')
  assert.equal(result.counts.C1, 2)
  assert.equal(result.counts.MERGED, 1)
})
