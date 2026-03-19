import type { OpenRouterModel } from './openrouter'

type CollaborationParticipantBlueprint = {
  id: string
  alias: string
  role: string
  modelCandidates: string[]
}

type CollaborationParticipantConfig = {
  id: string
  alias: string
  role: string
  modelId: string
}

type CollaborationStructuredValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>

type CollaborationParsedOutput = Record<string, CollaborationStructuredValue>

type CollaborationRoundRecord = {
  participant: CollaborationParticipantConfig
  rawOutput: string
  parsed: CollaborationParsedOutput
}

type CollaborationAuditSummary = {
  totals: Record<string, number>
  fatalFlaws: Record<string, string[]>
  winner: string
  summary: string
}

const DEFAULT_PARTICIPANT_BLUEPRINTS: CollaborationParticipantBlueprint[] = [
  {
    id: 'gpt',
    alias: 'GPT-5.4',
    role: 'formal verifier focused on rigor, edge cases, and synthesis quality',
    modelCandidates: ['openai/gpt-5.4', 'openai/gpt-5.4-pro', 'openai/gpt-5.2-high'],
  },
  {
    id: 'gemini',
    alias: 'Gemini 3.1',
    role: 'alternative reasoner focused on different paths, comparisons, and hidden assumptions',
    modelCandidates: [
      'google/gemini-3.1-pro-preview-customtools',
      'google/gemini-3.1-pro-preview',
      'google/gemini-3.1-flash-lite-preview',
      'google/gemini-2.5-pro',
    ],
  },
  {
    id: 'deepseek',
    alias: 'DeepSeek R1',
    role: 'aggressive critic focused on contradiction checks, missing evidence, and repair suggestions',
    modelCandidates: [
      'deepseek/deepseek-r1-0528',
      'deepseek/deepseek-r1',
      'tngtech/deepseek-r1t2-chimera',
    ],
  },
]

const DEFAULT_JUDGE_MODEL_CANDIDATES = [
  'openai/gpt-5.4',
  'openai/gpt-5.4-pro',
  'google/gemini-3.1-pro-preview-customtools',
  'google/gemini-3.1-pro-preview',
  'deepseek/deepseek-r1-0528',
]

function normalizeSearchableModel(model: OpenRouterModel) {
  return `${model.id} ${model.canonical_slug ?? ''} ${model.name}`.toLowerCase()
}

function resolveCandidateModelId(models: OpenRouterModel[], candidates: string[]) {
  for (const candidate of candidates) {
    const exactMatch = models.find((model) => model.id === candidate)

    if (exactMatch) {
      return exactMatch.id
    }
  }

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase()
    const fuzzyMatch = models.find((model) =>
      normalizeSearchableModel(model).includes(normalizedCandidate),
    )

    if (fuzzyMatch) {
      return fuzzyMatch.id
    }
  }

  return ''
}

function resolveDefaultRoom(models: OpenRouterModel[]) {
  const participants = DEFAULT_PARTICIPANT_BLUEPRINTS.map((blueprint, index) => {
    const modelId =
      resolveCandidateModelId(models, blueprint.modelCandidates) ||
      models[index]?.id ||
      ''

    return {
      id: blueprint.id,
      alias: blueprint.alias,
      role: blueprint.role,
      modelId,
    } satisfies CollaborationParticipantConfig
  })

  const judgeModelId =
    resolveCandidateModelId(models, DEFAULT_JUDGE_MODEL_CANDIDATES) ||
    participants[0]?.modelId ||
    models[0]?.id ||
    ''

  return {
    participants,
    judgeModelId,
  }
}

function buildFlexibleTagPattern(tag: string) {
  return tag
    .split('_')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*_\\s*')
}

function extractTag(text: string, tag: string) {
  const tagPattern = buildFlexibleTagPattern(tag)
  const match = text.match(
    new RegExp(`<\\s*${tagPattern}\\s*>\\s*([\\s\\S]*?)\\s*<\\/\\s*${tagPattern}\\s*>`, 'i'),
  )
  return match?.[1]?.trim() ?? ''
}

function parseConfidence(text: string, defaultValue = 50) {
  const match = text.match(/-?\d+/)

  if (!match) {
    return defaultValue
  }

  return Math.max(0, Math.min(100, Number(match[0])))
}

function parseScore(text: string, defaultValue = 0) {
  const match = text.match(/-?\d+/)

  if (!match) {
    return defaultValue
  }

  return Math.max(0, Math.min(10, Number(match[0])))
}

function parseJsonTag(text: string, tag: string) {
  const rawValue = extractTag(text, tag)

  if (!rawValue) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawValue)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

function parseRoundOutput(text: string, expectedTags: string[]) {
  const parsed: CollaborationParsedOutput = {}

  for (const tag of expectedTags) {
    parsed[tag] = extractTag(text, tag)
  }

  if ('confidence' in parsed) {
    parsed.confidence = parseConfidence(String(parsed.confidence ?? ''))
  }

  if ('confidence_after_self_critique' in parsed) {
    parsed.confidence_after_self_critique = parseConfidence(
      String(parsed.confidence_after_self_critique ?? ''),
    )
  }

  if ('winner' in parsed) {
    parsed.winner = String(parsed.winner ?? '').trim().toUpperCase()
  }

  if ('selected_candidate' in parsed) {
    parsed.selected_candidate = String(parsed.selected_candidate ?? '')
      .trim()
      .toUpperCase()
  }

  if (expectedTags.includes('scorecard')) {
    parsed.scorecard = parseJsonTag(text, 'scorecard')
  }

  return parsed
}

function participantSystemPrompt(participant: CollaborationParticipantConfig, participantCount = 3) {
  return [
    `You are one participant in a ${participantCount}-model collaboration focused on maximum correctness.`,
    `Your role is: ${participant.role}.`,
    'Be willing to change your mind when the evidence is against you.',
    'Return the requested tags exactly, with no spaces inside tag names, and keep claims explicit.',
    'Output only the requested tags, with no prose before or after them.',
    'If reasoning text is exposed by the provider, think carefully before answering.',
  ].join(' ')
}

function buildIndependentRoundPrompt(question: string) {
  return `
Question:
${question}

Work independently first. Do not assume the other models are correct.
If the task is quantitative, logical, or code-related, verify the conclusion with a second route before locking your answer.

Return exactly these tags:
<draft_answer>the best answer you can currently justify</draft_answer>
<confidence>0-100</confidence>
<key_points>key evidence, derivation, or reasoning steps</key_points>
<uncertainties>open risks, assumptions, or possible failure points</uncertainties>
  `.trim()
}

function buildSelfCritiquePrompt(question: string, draftText: string) {
  return `
Question:
${question}

Your previous draft:
${draftText}

Critique your own answer aggressively. Look for incorrect assumptions, arithmetic errors, missing edge cases, unsupported leaps, and ambiguity.

Return exactly these tags:
<self_critique>your strongest critique of your own draft</self_critique>
<confidence_after_self_critique>0-100</confidence_after_self_critique>
<repair_plan>how you would fix or strengthen the draft</repair_plan>
  `.trim()
}

function formatPeerBundle(
  records: CollaborationRoundRecord[],
  answerTag: string,
  critiqueTag?: string,
) {
  return records
    .flatMap((record) => {
      const answer = String(record.parsed[answerTag] ?? record.rawOutput).trim()
      const confidence =
        record.parsed.confidence ?? record.parsed.confidence_after_self_critique
      const critique = critiqueTag ? String(record.parsed[critiqueTag] ?? '').trim() : ''

      return [
        `${record.participant.alias} (${record.participant.modelId})`,
        `answer: ${answer}`,
        confidence != null ? `confidence: ${confidence}` : '',
        critique ? `critique: ${critique}` : '',
        '',
      ].filter(Boolean)
    })
    .join('\n')
    .trim()
}

function buildCandidateBundle(records: CollaborationRoundRecord[], answerTag: string) {
  const candidateMap: Record<string, CollaborationRoundRecord> = {}
  const lines: string[] = []

  records.forEach((record, index) => {
    const candidateId = `C${index + 1}`
    const answer = String(record.parsed[answerTag] ?? record.rawOutput).trim()

    candidateMap[candidateId] = record
    lines.push(`${candidateId}: ${record.participant.alias} (${record.participant.modelId})`)
    lines.push(`answer: ${answer}`)

    if (record.parsed.confidence != null) {
      lines.push(`confidence: ${record.parsed.confidence}`)
    }

    lines.push('')
  })

  return {
    bundle: lines.join('\n').trim(),
    candidateMap,
  }
}

function buildCrossCritiquePrompt(
  question: string,
  participant: CollaborationParticipantConfig,
  ownDraft: CollaborationRoundRecord,
  allDrafts: CollaborationRoundRecord[],
  selfCritique: CollaborationRoundRecord,
) {
  const peerBundle = formatPeerBundle(
    allDrafts.filter((record) => record.participant.id !== participant.id),
    'draft_answer',
  )

  return `
Question:
${question}

Your draft:
${ownDraft.rawOutput}

Your self-critique:
${selfCritique.rawOutput}

Peer drafts:
${peerBundle}

Critique the peer drafts. Focus on factual mistakes, flawed assumptions, missing cases, weak justifications, and places where a peer is stronger than you.

Return exactly these tags:
<peer_critique>your critique of the peer drafts</peer_critique>
<best_peer>one participant alias that currently has the strongest draft, or NONE</best_peer>
<what_you_missed>what the peers noticed that you may have missed</what_you_missed>
  `.trim()
}

function buildRevisionPrompt(
  question: string,
  ownDraft: CollaborationRoundRecord,
  selfCritique: CollaborationRoundRecord,
  peerCritiques: CollaborationRoundRecord[],
) {
  const peerBundle = formatPeerBundle(peerCritiques, 'peer_critique')

  return `
Question:
${question}

Your original draft:
${ownDraft.rawOutput}

Your self-critique:
${selfCritique.rawOutput}

Peer feedback:
${peerBundle}

Revise your answer for maximum correctness. Preserve good parts, remove bad parts, and resolve disagreements explicitly.
Prefer a concrete, falsifiable answer over vague hedging. If uncertainty remains, state exactly what could still change the conclusion.

Return exactly these tags:
<revised_answer>your revised best answer</revised_answer>
<confidence>0-100</confidence>
<why_better>why this revised answer is stronger than your original draft</why_better>
  `.trim()
}

function buildAuditPrompt(question: string, revisedRecords: CollaborationRoundRecord[]) {
  const { bundle, candidateMap } = buildCandidateBundle(revisedRecords, 'revised_answer')
  const candidateList = Object.keys(candidateMap).join(', ')

  return `
Question:
${question}

Revised candidate answers:
${bundle}

Audit every candidate independently. Score each one from 0 to 10 on correctness, completeness, and robustness.
Be adversarial, not polite. Penalize unsupported claims, arithmetic mistakes, unhandled edge cases, and answers that sound plausible without actually proving the point.
If you see a fatal flaw, say what it is. If not, use NONE.

Return exactly these tags:
<scorecard>{"C1":{"correctness":0,"completeness":0,"robustness":0,"fatal_flaw":"NONE"}}</scorecard>
<winner>one of ${candidateList}</winner>
<audit_summary>short explanation of which candidate is strongest and why</audit_summary>
  `.trim()
}

function buildVotePrompt(
  question: string,
  revisedRecords: CollaborationRoundRecord[],
  auditSummaryText: string,
) {
  const { bundle, candidateMap } = buildCandidateBundle(revisedRecords, 'revised_answer')
  const participantNames = [...Object.keys(candidateMap), 'MERGED'].join(' | ')

  return `
Question:
${question}

Revised candidate answers:
${bundle}

Audit summary:
${auditSummaryText}

Choose the strongest candidate answer, or choose MERGED if the best final answer should combine multiple candidates.

Valid selected_candidate values:
${participantNames}

Return exactly these tags:
<selected_candidate>candidate id or MERGED</selected_candidate>
<final_answer>the answer you would ship to the user now</final_answer>
<confidence>0-100</confidence>
<rationale>why this candidate or merge is strongest</rationale>
  `.trim()
}

function buildSynthesisPrompt(
  question: string,
  revisedRecords: CollaborationRoundRecord[],
  auditSummaryText: string,
  voteRecords: CollaborationRoundRecord[],
) {
  const revisedBundle = formatPeerBundle(revisedRecords, 'revised_answer')
  const voteBundle = formatPeerBundle(voteRecords, 'final_answer')

  return `
Question:
${question}

Final revised answers:
${revisedBundle}

Audit summary:
${auditSummaryText}

Final votes:
${voteBundle}

Produce the best final answer. Do not average weak answers together. Use the strongest supported reasoning, prefer answers backed by explicit checks, resolve conflicts directly, and be explicit if uncertainty remains.

Return exactly these tags:
<final_answer>best final answer for the user</final_answer>
<confidence>0-100</confidence>
<why_this_wins>why this final answer beats the alternatives</why_this_wins>
  `.trim()
}

function scoreCandidateEntry(entry: Record<string, unknown>) {
  const correctness = parseScore(String(entry.correctness ?? '0'))
  const completeness = parseScore(String(entry.completeness ?? '0'))
  const robustness = parseScore(String(entry.robustness ?? '0'))
  const fatalFlaw = String(entry.fatal_flaw ?? '').trim().toUpperCase()
  const penalty = fatalFlaw && fatalFlaw !== 'NONE' ? 6 : 0

  return correctness * 3 + completeness * 2 + robustness * 2 - penalty
}

function aggregateAuditScores(
  auditRecords: CollaborationRoundRecord[],
  revisedRecords: CollaborationRoundRecord[],
) {
  const { candidateMap } = buildCandidateBundle(revisedRecords, 'revised_answer')
  const totals: Record<string, number> = {}
  const fatalFlaws: Record<string, string[]> = {}

  Object.keys(candidateMap).forEach((candidateId) => {
    totals[candidateId] = 0
    fatalFlaws[candidateId] = []
  })

  auditRecords.forEach((record) => {
    const scorecard = record.parsed.scorecard

    if (!scorecard || typeof scorecard !== 'object' || Array.isArray(scorecard)) {
      return
    }

    Object.entries(scorecard).forEach(([candidateId, candidateValue]) => {
      if (!(candidateId in totals)) {
        return
      }

      if (!candidateValue || typeof candidateValue !== 'object' || Array.isArray(candidateValue)) {
        return
      }

      const candidateEntry = candidateValue as Record<string, unknown>
      totals[candidateId] += scoreCandidateEntry(candidateEntry)

      const fatalFlaw = String(candidateEntry.fatal_flaw ?? '').trim()

      if (fatalFlaw && fatalFlaw.toUpperCase() !== 'NONE') {
        fatalFlaws[candidateId].push(fatalFlaw)
      }
    })
  })

  const sortedCandidates = Object.entries(totals).sort((left, right) => right[1] - left[1])
  const winner = sortedCandidates[0]?.[0] ?? 'UNKNOWN'
  const lines = ['Aggregated audit scores:']

  sortedCandidates.forEach(([candidateId, total]) => {
    const participant = candidateMap[candidateId]?.participant
    lines.push(`- ${candidateId} (${participant?.alias ?? 'Unknown'}): ${total}`)

    if (fatalFlaws[candidateId]?.length) {
      lines.push(`  fatal_flaws: ${fatalFlaws[candidateId].slice(0, 3).join(' | ')}`)
    }
  })

  lines.push(`Best audit candidate: ${winner}`)

  return {
    totals,
    fatalFlaws,
    winner,
    summary: lines.join('\n'),
  } satisfies CollaborationAuditSummary
}

function determineVoteWinner(voteRecords: CollaborationRoundRecord[]) {
  const counts: Record<string, number> = {}

  voteRecords.forEach((record) => {
    const selectedCandidate = String(record.parsed.selected_candidate ?? '').trim() || 'UNKNOWN'
    counts[selectedCandidate] = (counts[selectedCandidate] ?? 0) + 1
  })

  const winner =
    Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'UNKNOWN'

  return {
    winner,
    counts,
  }
}

export {
  DEFAULT_JUDGE_MODEL_CANDIDATES,
  DEFAULT_PARTICIPANT_BLUEPRINTS,
  aggregateAuditScores,
  buildAuditPrompt,
  buildCrossCritiquePrompt,
  buildIndependentRoundPrompt,
  buildRevisionPrompt,
  buildSelfCritiquePrompt,
  buildSynthesisPrompt,
  buildVotePrompt,
  determineVoteWinner,
  extractTag,
  parseRoundOutput,
  participantSystemPrompt,
  resolveDefaultRoom,
}

export type {
  CollaborationAuditSummary,
  CollaborationParticipantBlueprint,
  CollaborationParticipantConfig,
  CollaborationParsedOutput,
  CollaborationRoundRecord,
  CollaborationStructuredValue,
}
