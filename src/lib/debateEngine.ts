import type { DebateConfig, DebateParticipant } from './debateConfig'
import type { ParticipantRoundMetrics, RoundMetrics } from './debateMetrics'
import { calculateEstimatedCost } from './debateMetrics'
import {
  aggregateAuditScores,
  buildAuditPrompt,
  buildCrossCritiquePrompt,
  buildIndependentRoundPrompt,
  buildRevisionPrompt,
  buildSelfCritiquePrompt,
  buildSynthesisPrompt,
  buildVotePrompt,
  determineVoteWinner,
  parseRoundOutput,
  type CollaborationParticipantConfig,
  type CollaborationRoundRecord,
} from './collaboration'
import {
  createOpenRouterChatCompletionStream,
  fetchOpenRouterModels,
  type OpenRouterAssistantReply,
  type OpenRouterChatMessage,
  type OpenRouterModel,
} from './openrouter'

type RoundStage =
  | 'independent'
  | 'self-critique'
  | 'cross-critique'
  | 'revision'
  | 'audit'
  | 'vote'
  | 'synthesis'

type DebateCallbacks = {
  onRoundStart?: (stage: RoundStage, roundIndex: number) => void
  onParticipantProgress?: (participantId: string, stage: RoundStage, reply: OpenRouterAssistantReply) => void
  onParticipantComplete?: (participantId: string, stage: RoundStage, record: CollaborationRoundRecord, metrics: ParticipantRoundMetrics) => void
  onRoundComplete?: (stage: RoundStage, roundMetrics: RoundMetrics) => void
  onSynthesisProgress?: (text: string) => void
  onComplete?: (synthesis: string, allRounds: RoundMetrics[]) => void
  onError?: (error: Error) => void
}

function participantSystemPrompt(participant: DebateParticipant, totalParticipants: number) {
  return [
    `You are one participant in a ${totalParticipants}-model collaboration focused on maximum correctness.`,
    `Your role is: ${participant.role}.`,
    'Be willing to change your mind when the evidence is against you.',
    'Return the requested tags exactly, with no spaces inside tag names, and keep claims explicit.',
    'Output only the requested tags, with no prose before or after them.',
    'If reasoning text is exposed by the provider, think carefully before answering.',
  ].join(' ')
}

function toCollabParticipant(p: DebateParticipant): CollaborationParticipantConfig {
  return { id: p.id, alias: p.alias, role: p.role, modelId: p.modelId }
}

function buildRoundSequence(config: DebateConfig): RoundStage[] {
  const stages: RoundStage[] = ['independent']

  if (config.enableSelfCritique) {
    stages.push('self-critique')
  }

  if (config.enableCrossCritique) {
    stages.push('cross-critique')
  }

  stages.push('revision')
  stages.push('audit')

  if (config.synthesisMode === 'vote' || config.synthesisMode === 'judge-pick') {
    stages.push('vote')
  }

  stages.push('synthesis')

  return stages
}

async function runParticipantCall(
  participant: DebateParticipant,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  signal: AbortSignal,
  onProgress?: (reply: OpenRouterAssistantReply) => void,
  maxTokens?: number,
): Promise<{ reply: OpenRouterAssistantReply; latencyMs: number }> {
  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const startMs = Date.now()

  const reply = await createOpenRouterChatCompletionStream({
    apiKey,
    model: participant.modelId,
    messages,
    includeReasoning: true,
    reasoning: { effort: 'high' },
    maxTokens,
    onProgress: (r) => {
      if (!signal.aborted) onProgress?.(r)
    },
  })

  return { reply, latencyMs: Date.now() - startMs }
}

function buildParticipantMetrics(
  participant: DebateParticipant,
  roundIndex: number,
  reply: OpenRouterAssistantReply,
  latencyMs: number,
  modelPricing?: OpenRouterModel['pricing'],
): ParticipantRoundMetrics {
  const usage = reply.usage
  return {
    participantId: participant.id,
    modelId: participant.modelId,
    roundIndex,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    latencyMs,
    estimatedCost: calculateEstimatedCost(usage, modelPricing),
  }
}

async function runDebateSession(
  config: DebateConfig,
  question: string,
  apiKey: string,
  callbacks: DebateCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const stages = buildRoundSequence(config)
  const allRoundMetrics: RoundMetrics[] = []
  const modelList = await fetchOpenRouterModels()
  const modelMap = new Map(modelList.map((m) => [m.id, m]))

  const totalParticipants = config.participants.length

  // Stage record storage
  const independentRecords: CollaborationRoundRecord[] = []
  const selfCritiqueRecords: CollaborationRoundRecord[] = []
  const crossCritiqueRecords: CollaborationRoundRecord[] = []
  const revisionRecords: CollaborationRoundRecord[] = []
  const auditRecords: CollaborationRoundRecord[] = []
  const voteRecords: CollaborationRoundRecord[] = []

  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const stage = stages[stageIdx]

    if (signal.aborted) return

    callbacks.onRoundStart?.(stage, stageIdx)

    const roundParticipantMetrics: ParticipantRoundMetrics[] = []
    const roundStartMs = Date.now()

    if (stage === 'independent') {
      for (const participant of config.participants) {
        if (signal.aborted) return

        const sys = participantSystemPrompt(participant, totalParticipants)
        const userPrompt = buildIndependentRoundPrompt(question)
        const maxTokens = participant.tokenBudget ?? config.perRoundTokenBudget

        const { reply, latencyMs } = await runParticipantCall(
          participant, sys, userPrompt, apiKey, signal,
          (r) => callbacks.onParticipantProgress?.(participant.id, stage, r),
          maxTokens,
        )

        const record: CollaborationRoundRecord = {
          participant: toCollabParticipant(participant),
          rawOutput: reply.text,
          parsed: parseRoundOutput(reply.text, ['draft_answer', 'confidence', 'key_points', 'uncertainties']),
        }
        independentRecords.push(record)

        const metrics = buildParticipantMetrics(participant, stageIdx, reply, latencyMs, modelMap.get(participant.modelId)?.pricing)
        roundParticipantMetrics.push(metrics)
        callbacks.onParticipantComplete?.(participant.id, stage, record, metrics)
      }
    } else if (stage === 'self-critique') {
      for (const participant of config.participants) {
        if (signal.aborted) return

        const draft = independentRecords.find((r) => r.participant.id === participant.id)
        if (!draft) continue

        const sys = participantSystemPrompt(participant, totalParticipants)
        const userPrompt = buildSelfCritiquePrompt(question, draft.rawOutput)
        const maxTokens = participant.tokenBudget ?? config.perRoundTokenBudget

        const { reply, latencyMs } = await runParticipantCall(
          participant, sys, userPrompt, apiKey, signal,
          (r) => callbacks.onParticipantProgress?.(participant.id, stage, r),
          maxTokens,
        )

        const record: CollaborationRoundRecord = {
          participant: toCollabParticipant(participant),
          rawOutput: reply.text,
          parsed: parseRoundOutput(reply.text, ['self_critique', 'confidence_after_self_critique', 'repair_plan']),
        }
        selfCritiqueRecords.push(record)

        const metrics = buildParticipantMetrics(participant, stageIdx, reply, latencyMs, modelMap.get(participant.modelId)?.pricing)
        roundParticipantMetrics.push(metrics)
        callbacks.onParticipantComplete?.(participant.id, stage, record, metrics)
      }
    } else if (stage === 'cross-critique') {
      for (const participant of config.participants) {
        if (signal.aborted) return

        const ownDraft = independentRecords.find((r) => r.participant.id === participant.id)
        const ownSelfCritique = selfCritiqueRecords.find((r) => r.participant.id === participant.id) ?? {
          participant: toCollabParticipant(participant),
          rawOutput: '',
          parsed: {},
        }
        if (!ownDraft) continue

        const sys = participantSystemPrompt(participant, totalParticipants)
        const userPrompt = buildCrossCritiquePrompt(
          question,
          toCollabParticipant(participant),
          ownDraft,
          independentRecords,
          ownSelfCritique,
        )
        const maxTokens = participant.tokenBudget ?? config.perRoundTokenBudget

        const { reply, latencyMs } = await runParticipantCall(
          participant, sys, userPrompt, apiKey, signal,
          (r) => callbacks.onParticipantProgress?.(participant.id, stage, r),
          maxTokens,
        )

        const record: CollaborationRoundRecord = {
          participant: toCollabParticipant(participant),
          rawOutput: reply.text,
          parsed: parseRoundOutput(reply.text, ['peer_critique', 'best_peer', 'what_you_missed']),
        }
        crossCritiqueRecords.push(record)

        const metrics = buildParticipantMetrics(participant, stageIdx, reply, latencyMs, modelMap.get(participant.modelId)?.pricing)
        roundParticipantMetrics.push(metrics)
        callbacks.onParticipantComplete?.(participant.id, stage, record, metrics)
      }
    } else if (stage === 'revision') {
      for (const participant of config.participants) {
        if (signal.aborted) return

        const ownDraft = independentRecords.find((r) => r.participant.id === participant.id)
        const ownSelfCritique = selfCritiqueRecords.find((r) => r.participant.id === participant.id) ?? {
          participant: toCollabParticipant(participant),
          rawOutput: '',
          parsed: {},
        }
        if (!ownDraft) continue

        const peerCritiques = crossCritiqueRecords.filter((r) => r.participant.id !== participant.id)
        const sys = participantSystemPrompt(participant, totalParticipants)
        const userPrompt = buildRevisionPrompt(question, ownDraft, ownSelfCritique, peerCritiques)
        const maxTokens = participant.tokenBudget ?? config.perRoundTokenBudget

        const { reply, latencyMs } = await runParticipantCall(
          participant, sys, userPrompt, apiKey, signal,
          (r) => callbacks.onParticipantProgress?.(participant.id, stage, r),
          maxTokens,
        )

        const record: CollaborationRoundRecord = {
          participant: toCollabParticipant(participant),
          rawOutput: reply.text,
          parsed: parseRoundOutput(reply.text, ['revised_answer', 'confidence', 'why_better']),
        }
        revisionRecords.push(record)

        const metrics = buildParticipantMetrics(participant, stageIdx, reply, latencyMs, modelMap.get(participant.modelId)?.pricing)
        roundParticipantMetrics.push(metrics)
        callbacks.onParticipantComplete?.(participant.id, stage, record, metrics)
      }
    } else if (stage === 'audit') {
      // Audit is done by the judge model
      const judgeParticipant: DebateParticipant = {
        id: '__judge__',
        modelId: config.judgeModelId,
        alias: 'Judge',
        role: 'independent auditor',
      }

      const revisedToAudit = revisionRecords.length > 0 ? revisionRecords : independentRecords
      const sys = participantSystemPrompt(judgeParticipant, totalParticipants)
      const userPrompt = buildAuditPrompt(question, revisedToAudit)

      const { reply, latencyMs } = await runParticipantCall(
        judgeParticipant, sys, userPrompt, apiKey, signal,
        (r) => callbacks.onParticipantProgress?.(judgeParticipant.id, stage, r),
        config.perRoundTokenBudget,
      )

      const record: CollaborationRoundRecord = {
        participant: toCollabParticipant(judgeParticipant),
        rawOutput: reply.text,
        parsed: parseRoundOutput(reply.text, ['scorecard', 'winner', 'audit_summary']),
      }
      auditRecords.push(record)

      const metrics = buildParticipantMetrics(judgeParticipant, stageIdx, reply, latencyMs, modelMap.get(config.judgeModelId)?.pricing)
      roundParticipantMetrics.push(metrics)
      callbacks.onParticipantComplete?.(judgeParticipant.id, stage, record, metrics)
    } else if (stage === 'vote') {
      const revisedToVote = revisionRecords.length > 0 ? revisionRecords : independentRecords
      const auditSummary = auditRecords[0]?.parsed?.audit_summary
        ? String(auditRecords[0].parsed.audit_summary)
        : ''

      for (const participant of config.participants) {
        if (signal.aborted) return

        const sys = participantSystemPrompt(participant, totalParticipants)
        const userPrompt = buildVotePrompt(question, revisedToVote, auditSummary)
        const maxTokens = participant.tokenBudget ?? config.perRoundTokenBudget

        const { reply, latencyMs } = await runParticipantCall(
          participant, sys, userPrompt, apiKey, signal,
          (r) => callbacks.onParticipantProgress?.(participant.id, stage, r),
          maxTokens,
        )

        const record: CollaborationRoundRecord = {
          participant: toCollabParticipant(participant),
          rawOutput: reply.text,
          parsed: parseRoundOutput(reply.text, ['selected_candidate', 'final_answer', 'confidence', 'rationale']),
        }
        voteRecords.push(record)

        const metrics = buildParticipantMetrics(participant, stageIdx, reply, latencyMs, modelMap.get(participant.modelId)?.pricing)
        roundParticipantMetrics.push(metrics)
        callbacks.onParticipantComplete?.(participant.id, stage, record, metrics)
      }
    } else if (stage === 'synthesis') {
      const revisedToSynthesize = revisionRecords.length > 0 ? revisionRecords : independentRecords
      const auditSummary = auditRecords[0]?.parsed?.audit_summary
        ? String(auditRecords[0].parsed.audit_summary)
        : aggregateAuditScores(auditRecords, revisedToSynthesize).summary

      const judgeParticipant: DebateParticipant = {
        id: '__judge__',
        modelId: config.judgeModelId,
        alias: 'Judge',
        role: 'synthesis',
      }

      const sys = participantSystemPrompt(judgeParticipant, totalParticipants)
      const userPrompt = buildSynthesisPrompt(question, revisedToSynthesize, auditSummary, voteRecords)

      const { reply, latencyMs } = await runParticipantCall(
        judgeParticipant, sys, userPrompt, apiKey, signal,
        (r) => {
          callbacks.onParticipantProgress?.(judgeParticipant.id, stage, r)
          callbacks.onSynthesisProgress?.(r.text)
        },
        config.perRoundTokenBudget,
      )

      const record: CollaborationRoundRecord = {
        participant: toCollabParticipant(judgeParticipant),
        rawOutput: reply.text,
        parsed: parseRoundOutput(reply.text, ['final_answer', 'confidence', 'why_this_wins']),
      }

      const metrics = buildParticipantMetrics(judgeParticipant, stageIdx, reply, latencyMs, modelMap.get(config.judgeModelId)?.pricing)
      roundParticipantMetrics.push(metrics)
      callbacks.onParticipantComplete?.(judgeParticipant.id, stage, record, metrics)

      const roundMetrics: RoundMetrics = {
        roundIndex: stageIdx,
        roundLabel: stage,
        participants: roundParticipantMetrics,
        totalLatencyMs: Date.now() - roundStartMs,
      }
      allRoundMetrics.push(roundMetrics)
      callbacks.onRoundComplete?.(stage, roundMetrics)

      const finalAnswer = String(record.parsed.final_answer ?? reply.text)
      callbacks.onComplete?.(finalAnswer, allRoundMetrics)
      return
    }

    const roundMetrics: RoundMetrics = {
      roundIndex: stageIdx,
      roundLabel: stage,
      participants: roundParticipantMetrics,
      totalLatencyMs: Date.now() - roundStartMs,
    }
    allRoundMetrics.push(roundMetrics)
    callbacks.onRoundComplete?.(stage, roundMetrics)
  }
}

export { buildRoundSequence, runDebateSession }
export type { DebateCallbacks, RoundStage }

// Re-export for convenience
export { aggregateAuditScores, determineVoteWinner }
