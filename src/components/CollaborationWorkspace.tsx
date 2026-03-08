import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import type { User } from 'firebase/auth'
import {
  ArrowUp,
  ChevronDown,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  Trash2,
  X,
} from 'lucide-react'
import {
  createOpenRouterChatCompletionStream,
  fetchOpenRouterModels,
  type OpenRouterChatMessage,
  type OpenRouterModel,
  type OpenRouterReasoningDetail,
  type OpenRouterUsage,
} from '../lib/openrouter'
import {
  getModelCapabilityProfile,
  type OpenRouterModelCapabilityProfile,
} from '../lib/openrouterCapabilities'
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
  participantSystemPrompt,
  resolveDefaultRoom,
  type CollaborationParsedOutput,
  type CollaborationParticipantConfig,
} from '../lib/collaboration'
import {
  RichMessageContent,
  type RichMessageAttachment,
} from './RichMessageContent'

type ResolvedParticipant = CollaborationParticipantConfig & {
  profile: OpenRouterModelCapabilityProfile
}

interface Turn {
  id: string
  prompt: string
  attachments: TurnAttachment[]
  status: 'loading' | 'done' | 'error'
  rounds: Round[]
  error?: string
}

interface Round {
  id: string
  participants: ParticipantResponse[]
  synthesis?: SynthesisOutput
  votes?: VoteOutput
  audit?: AuditOutput
}

interface ParticipantResponse {
  participantId: string
  participantName: string
  participantRole: string
  response: string
  parsed?: CollaborationParsedOutput
  reasoningContent?: string
  audioUrl?: string
}

interface SynthesisOutput {
  id: string
  judgeId: string
  judgeName: string
  synthesis: string
  reasoning?: string
}

interface VoteOutput {
  id: string
  votes: Array<{ participantId: string; points: number }>
  winner: string
}

interface AuditOutput {
  id: string
  scores: Record<string, number>
  notes: Array<{ participantId: string; note: string }>
}

type TurnAttachment = RichMessageAttachment

interface MessageAttachmentSource {
  raw: Uint8Array
  mediaType: string
}

interface ParsedAttachment {
  id: string
  name: string
  summary: string
  source: MessageAttachmentSource
}

const COLLAB_COMPOSER_BASE_HEIGHT = 50
const COLLAB_STACK_BUFFER = 300

function parseAttachmentName(fileName: string): string {
  const match = fileName.match(/^[A-Z0-9]{8}-/)
  return match ? fileName.slice(match[0].length) : fileName
}

function buildPromptPayload(
  message: string,
  attachments: TurnAttachment[]
): string {
  if (attachments.length === 0) return message

  const attachmentText = attachments
    .map((attachment) => `Attachment: ${attachment.name}\n${attachment.summary}`)
    .join('\n\n')

  return `${message}\n\n${attachmentText}`
}

function createTurn(
  prompt: string,
  attachments: TurnAttachment[],
  participants: ResolvedParticipant[],
  judge: { modelId: string; modelName: string }
): Turn {
  return {
    id: crypto.randomUUID(),
    prompt,
    attachments,
    status: 'loading',
    rounds: [
      {
        id: crypto.randomUUID(),
        participants: participants.map((participant) => ({
          participantId: participant.id,
          participantName: participant.alias,
          participantRole: participant.role,
          response: '',
        })),
      },
    ],
  }
}

interface CollaborationWorkspaceProps {
  user?: User
  apiKey?: string
  onClearApiKey?: () => void
}

export function CollaborationWorkspace({
  user,
  apiKey: providedApiKey,
  onClearApiKey,
}: CollaborationWorkspaceProps) {
  // Component commented out for redesign
  return <div></div>
}

export { CollaborationWorkspace }
