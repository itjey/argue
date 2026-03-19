import type { CollaborationParticipantBlueprint } from './collaboration'
import { DEFAULT_PARTICIPANT_BLUEPRINTS } from './collaboration'

type PredefinedRole =
  | 'formal-verifier'
  | 'alternative-reasoner'
  | 'aggressive-critic'
  | 'builder'
  | 'analyst'
  | 'adversary'

type PredefinedRoleDescriptor = {
  id: PredefinedRole
  label: string
  description: string
  systemPromptFragment: string
}

type DebateParticipant = {
  id: string
  modelId: string
  alias: string
  role: string
  tokenBudget?: number
}

type SynthesisMode = 'vote' | 'merge' | 'judge-pick'

type DebateConfig = {
  participants: DebateParticipant[]
  roundCount: number
  perRoundTokenBudget?: number
  judgeModelId: string
  synthesisMode: SynthesisMode
  enableSelfCritique: boolean
  enableCrossCritique: boolean
}

const PREDEFINED_ROLES: PredefinedRoleDescriptor[] = [
  {
    id: 'formal-verifier',
    label: 'Formal Verifier',
    description: 'Focuses on rigor, edge cases, and mathematical/logical correctness',
    systemPromptFragment: 'Your role is formal verifier: focus on rigor, edge cases, and synthesis quality.',
  },
  {
    id: 'alternative-reasoner',
    label: 'Alternative Reasoner',
    description: 'Explores different reasoning paths and challenges hidden assumptions',
    systemPromptFragment: 'Your role is alternative reasoner: focus on different paths, comparisons, and hidden assumptions.',
  },
  {
    id: 'aggressive-critic',
    label: 'Aggressive Critic',
    description: 'Checks for contradictions, missing evidence, and suggests repairs',
    systemPromptFragment: 'Your role is aggressive critic: focus on contradiction checks, missing evidence, and repair suggestions.',
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Provides thorough, complete solutions with detailed reasoning',
    systemPromptFragment: 'Your role is builder: provide a thorough, complete solution. Show your reasoning and produce the best possible answer.',
  },
  {
    id: 'analyst',
    label: 'Analyst',
    description: 'Deeply analyzes problems, identifies edge cases and key patterns',
    systemPromptFragment: 'Your role is analyst: deeply analyze the problem, identify edge cases, underlying patterns, and important considerations others might miss.',
  },
  {
    id: 'adversary',
    label: 'Adversary',
    description: 'Challenges all other answers, finds flaws, and forces improvements',
    systemPromptFragment: 'Your role is adversary: aggressively challenge the other models\' responses, find everything wrong or missing.',
  },
]

function blueprintToParticipant(blueprint: CollaborationParticipantBlueprint): DebateParticipant {
  return {
    id: blueprint.id,
    modelId: blueprint.modelCandidates[0] ?? '',
    alias: blueprint.alias,
    role: blueprint.role,
  }
}

const DEFAULT_DEBATE_CONFIG: DebateConfig = {
  participants: DEFAULT_PARTICIPANT_BLUEPRINTS.map(blueprintToParticipant),
  roundCount: 1,
  judgeModelId: 'openai/gpt-5.4',
  synthesisMode: 'merge',
  enableSelfCritique: true,
  enableCrossCritique: true,
}

function validateDebateConfig(config: DebateConfig): string[] {
  const errors: string[] = []

  if (config.participants.length < 2) {
    errors.push('At least 2 participants are required.')
  }

  if (config.roundCount < 1 || config.roundCount > 5) {
    errors.push('Round count must be between 1 and 5.')
  }

  for (const p of config.participants) {
    if (!p.modelId) {
      errors.push(`Participant "${p.alias || p.id}" has no model selected.`)
    }
  }

  if (!config.judgeModelId) {
    errors.push('A judge model must be selected.')
  }

  return errors
}

export {
  DEFAULT_DEBATE_CONFIG,
  PREDEFINED_ROLES,
  validateDebateConfig,
}

export type {
  DebateConfig,
  DebateParticipant,
  PredefinedRole,
  PredefinedRoleDescriptor,
  SynthesisMode,
}
