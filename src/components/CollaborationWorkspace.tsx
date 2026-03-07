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

type CollaborationWorkspaceProps = {
  currentUser: User
}

type CollaborationAttachment = RichMessageAttachment & {
  inlineText: string
}

type CollaborationRoundId =
  | 'draft'
  | 'self_critique'
  | 'cross_critique'
  | 'revision'
  | 'audit'
  | 'vote'

type CollaborationRoundEntryStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'skipped'

type CollaborationTurnStatus = 'running' | 'complete' | 'error'

type ResolvedParticipant = CollaborationParticipantConfig & {
  modelName: string
  profile: OpenRouterModelCapabilityProfile | null
}

type CollaborationRoundEntry = {
  participantId: string
  alias: string
  role: string
  modelId: string
  modelName: string
  reasoningBadge: string
  reasoningKind:
    | 'trace'
    | 'hybrid'
    | 'protected'
    | 'provider'
    | 'none'
  status: CollaborationRoundEntryStatus
  phase: string | null
  text: string
  reasoning: string
  reasoningDetails: OpenRouterReasoningDetail[]
  refusal: string
  usage: OpenRouterUsage | null
  parsed: CollaborationParsedOutput
  error: string
}

type CollaborationRound = {
  id: CollaborationRoundId
  title: string
  description: string
  status: CollaborationRoundEntryStatus
  entries: CollaborationRoundEntry[]
}

type CollaborationSynthesis = {
  modelId: string
  modelName: string
  status: CollaborationRoundEntryStatus
  phase: string | null
  text: string
  reasoning: string
  reasoningDetails: OpenRouterReasoningDetail[]
  refusal: string
  usage: OpenRouterUsage | null
  parsed: CollaborationParsedOutput
  error: string
}

type CollaborationTurn = {
  id: string
  prompt: string
  attachments: CollaborationAttachment[]
  createdAt: string
  status: CollaborationTurnStatus
  rounds: CollaborationRound[]
  audit: {
    summary: string
    winner: string
    totals: Record<string, number>
    fatalFlaws: Record<string, string[]>
  } | null
  vote: {
    winner: string
    counts: Record<string, number>
  } | null
  synthesis: CollaborationSynthesis
  error: string
}

type CollaborationStepRecord = {
  participant: ResolvedParticipant
  rawOutput: string
  parsed: CollaborationParsedOutput
}

const OPENROUTER_KEY_STORAGE = 'argue-openrouter-api-key'
const COLLAB_COMPOSER_BASE_HEIGHT = 28
const CODE_FILE_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.md',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])
const CODE_FILE_ACCEPT = [...CODE_FILE_EXTENSIONS].join(',')

const roundDefinitions: Array<{
  id: CollaborationRoundId
  title: string
  description: string
}> = [
  { id: 'draft', title: 'Round 1', description: 'Independent draft' },
  { id: 'self_critique', title: 'Round 2', description: 'Self-critique' },
  { id: 'cross_critique', title: 'Round 3', description: 'Cross-critique' },
  { id: 'revision', title: 'Round 4', description: 'Revision' },
  { id: 'audit', title: 'Round 5', description: 'Adversarial audit' },
  { id: 'vote', title: 'Round 6', description: 'Final vote' },
]

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const decimals = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(decimals)} ${units[unitIndex]}`
}

function getFileExtension(name: string) {
  const lastDotIndex = name.lastIndexOf('.')
  return lastDotIndex >= 0 ? name.slice(lastDotIndex).toLowerCase() : ''
}

function isCodeOrTextFile(file: File) {
  return (
    file.type.startsWith('text/') || CODE_FILE_EXTENSIONS.has(getFileExtension(file.name))
  )
}

function getCodeFenceLanguage(name: string) {
  const extension = getFileExtension(name)

  switch (extension) {
    case '.js':
    case '.jsx':
      return 'javascript'
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.py':
      return 'python'
    case '.md':
      return 'markdown'
    case '.json':
      return 'json'
    case '.html':
      return 'html'
    case '.css':
    case '.scss':
      return 'css'
    case '.sh':
      return 'bash'
    case '.sql':
      return 'sql'
    case '.yaml':
    case '.yml':
      return 'yaml'
    case '.xml':
      return 'xml'
    default:
      return ''
  }
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error(`The file ${file.name} could not be read as text.`))
    }

    reader.onerror = () =>
      reject(new Error(`The file ${file.name} could not be read as text.`))
    reader.readAsText(file)
  })
}

function buildTextFilePrompt(fileName: string, content: string) {
  const language = getCodeFenceLanguage(fileName)
  const normalizedContent = content.trimEnd()

  return `Attached file: ${fileName}\n\`\`\`${language}\n${normalizedContent}\n\`\`\``
}

function StructuredOutput({
  parsed,
}: {
  parsed: CollaborationParsedOutput
}) {
  const entries = Object.entries(parsed).filter(([, value]) => {
    if (value == null) {
      return false
    }

    if (typeof value === 'string') {
      return value.trim().length > 0
    }

    if (typeof value === 'object') {
      return Object.keys(value).length > 0
    }

    return true
  })

  if (entries.length === 0) {
    return null
  }

  return (
    <details className="collab-structured">
      <summary>Structured</summary>
      <div className="collab-structured-grid">
        {entries.map(([key, value]) => (
          <article className="collab-structured-item" key={key}>
            <h5>{key.replace(/_/g, ' ')}</h5>
            {typeof value === 'object' ? (
              <pre>{JSON.stringify(value, null, 2)}</pre>
            ) : (
              <p>{String(value)}</p>
            )}
          </article>
        ))}
      </div>
    </details>
  )
}

async function createAttachmentFromFile(file: File) {
  if (!isCodeOrTextFile(file)) {
    throw new Error(`${file.name} must be a code or text file for collaboration mode.`)
  }

  const textContent = await readFileAsText(file)

  return {
    id: createId(),
    kind: 'code',
    name: file.name,
    summary: `${formatBytes(file.size)} text context`,
    inlineText: buildTextFilePrompt(file.name, textContent),
  } satisfies CollaborationAttachment
}

function buildPromptPayload(message: string, attachments: CollaborationAttachment[]) {
  return [message.trim(), ...attachments.map((attachment) => attachment.inlineText)]
    .filter(Boolean)
    .join('\n\n')
}

function getEntryBadge(profile: OpenRouterModelCapabilityProfile | null) {
  if (!profile) {
    return {
      badge: 'Unknown',
      kind: 'none' as const,
    }
  }

  return {
    badge: profile.reasoningExposure.badge,
    kind: profile.reasoningExposure.kind,
  }
}

function getReasoningConfig(participant: ResolvedParticipant) {
  if (!participant.profile?.supportsReasoning) {
    return undefined
  }

  const normalizedId = participant.modelId.toLowerCase()

  if (normalizedId.includes('gemini-3.1')) {
    return {
      effort: 'high' as const,
      summary: 'detailed' as const,
      max_tokens: 4096,
    }
  }

  if (normalizedId.includes('gpt-5.4')) {
    return {
      effort: 'high' as const,
      summary: 'detailed' as const,
      max_tokens: 3072,
    }
  }

  return {
    effort: 'high' as const,
    summary: 'detailed' as const,
  }
}

function createRoundEntry(participant: ResolvedParticipant): CollaborationRoundEntry {
  const badge = getEntryBadge(participant.profile)

  return {
    participantId: participant.id,
    alias: participant.alias,
    role: participant.role,
    modelId: participant.modelId,
    modelName: participant.modelName,
    reasoningBadge: badge.badge,
    reasoningKind: badge.kind,
    status: 'pending',
    phase: null,
    text: '',
    reasoning: '',
    reasoningDetails: [],
    refusal: '',
    usage: null,
    parsed: {},
    error: '',
  }
}

function createTurn(
  prompt: string,
  attachments: CollaborationAttachment[],
  participants: ResolvedParticipant[],
  judge: { modelId: string; modelName: string },
) {
  return {
    id: createId(),
    prompt,
    attachments,
    createdAt: new Date().toISOString(),
    status: 'running',
    rounds: roundDefinitions.map((definition) => ({
      ...definition,
      status: 'pending',
      entries: participants.map((participant) => createRoundEntry(participant)),
    })),
    audit: null,
    vote: null,
    synthesis: {
      modelId: judge.modelId,
      modelName: judge.modelName,
      status: 'pending',
      phase: null,
      text: '',
      reasoning: '',
      reasoningDetails: [],
      refusal: '',
      usage: null,
      parsed: {},
      error: '',
    },
    error: '',
  } satisfies CollaborationTurn
}

function CollaborationWorkspace({ currentUser }: CollaborationWorkspaceProps) {
  void currentUser
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoScrollRef = useRef(true)
  const roomInitializedRef = useRef(false)

  const [draftApiKey, setDraftApiKey] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState('')
  const [participants, setParticipants] = useState<CollaborationParticipantConfig[]>([
    {
      id: 'gpt',
      alias: 'GPT-5.4',
      role: 'formal verifier focused on rigor, edge cases, and synthesis quality',
      modelId: '',
    },
    {
      id: 'gemini',
      alias: 'Gemini 3.1',
      role: 'alternative reasoner focused on different paths, comparisons, and hidden assumptions',
      modelId: '',
    },
    {
      id: 'deepseek',
      alias: 'DeepSeek R1',
      role: 'aggressive critic focused on contradiction checks, missing evidence, and repair suggestions',
      modelId: '',
    },
  ])
  const [judgeModelId, setJudgeModelId] = useState('')
  const [draftMessage, setDraftMessage] = useState('')
  const [attachments, setAttachments] = useState<CollaborationAttachment[]>([])
  const [turns, setTurns] = useState<CollaborationTurn[]>([])
  const [workspaceError, setWorkspaceError] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
    setDraftApiKey(storedKey)
    setSavedApiKey(storedKey)
  }, [])

  useEffect(() => {
    void loadModels()
  }, [])

  useEffect(() => {
    if (!models.length || roomInitializedRef.current) {
      return
    }

    const defaults = resolveDefaultRoom(models)

    setParticipants((currentParticipants) =>
      currentParticipants.map((participant) => {
        const matchingDefault = defaults.participants.find(
          (candidate) => candidate.id === participant.id,
        )

        return matchingDefault
          ? {
              ...participant,
              modelId: matchingDefault.modelId,
            }
          : participant
      }),
    )
    setJudgeModelId(defaults.judgeModelId)
    roomInitializedRef.current = true
  }, [models])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return
    }

    const container = stackRef.current

    if (!container) {
      return
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto',
    })
  }, [isRunning, turns])

  async function loadModels() {
    setModelsLoading(true)
    setModelsError('')

    try {
      const nextModels = await fetchOpenRouterModels()
      setModels(nextModels)
    } catch (error) {
      setModelsError(
        error instanceof Error
          ? error.message
          : 'OpenRouter models could not be loaded.',
      )
    } finally {
      setModelsLoading(false)
    }
  }

  function resizeComposerTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = `${COLLAB_COMPOSER_BASE_HEIGHT}px`
    textarea.style.height = `${Math.max(textarea.scrollHeight, COLLAB_COMPOSER_BASE_HEIGHT)}px`
  }

  function handleDraftMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraftMessage(event.target.value)
    resizeComposerTextarea(event.currentTarget)
  }

  function handleMessageStackScroll() {
    const container = stackRef.current

    if (!container) {
      return
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom <= 96
  }

  function updateTurn(
    turnId: string,
    updater: (turn: CollaborationTurn) => CollaborationTurn,
  ) {
    startTransition(() => {
      setTurns((currentTurns) =>
        currentTurns.map((turn) => (turn.id === turnId ? updater(turn) : turn)),
      )
    })
  }

  function updateRound(
    turnId: string,
    roundId: CollaborationRoundId,
    updater: (round: CollaborationRound) => CollaborationRound,
  ) {
    updateTurn(turnId, (turn) => ({
      ...turn,
      rounds: turn.rounds.map((round) => (round.id === roundId ? updater(round) : round)),
    }))
  }

  function updateRoundEntry(
    turnId: string,
    roundId: CollaborationRoundId,
    participantId: string,
    updater: (entry: CollaborationRoundEntry) => CollaborationRoundEntry,
  ) {
    updateRound(turnId, roundId, (round) => ({
      ...round,
      entries: round.entries.map((entry) =>
        entry.participantId === participantId ? updater(entry) : entry,
      ),
    }))
  }

  function updateRoundStatus(
    turnId: string,
    roundId: CollaborationRoundId,
    status: CollaborationRoundEntryStatus,
  ) {
    updateRound(turnId, roundId, (round) => ({
      ...round,
      status,
    }))
  }

  function updateSynthesis(
    turnId: string,
    updater: (synthesis: CollaborationSynthesis) => CollaborationSynthesis,
  ) {
    updateTurn(turnId, (turn) => ({
      ...turn,
      synthesis: updater(turn.synthesis),
    }))
  }

  async function handleAttachmentSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (selectedFiles.length === 0) {
      return
    }

    const nextAttachments: CollaborationAttachment[] = []

    for (const file of selectedFiles) {
      try {
        nextAttachments.push(await createAttachmentFromFile(file))
      } catch (error) {
        setWorkspaceError(
          error instanceof Error
            ? error.message
            : 'One of the selected files could not be attached.',
        )
      }
    }

    if (nextAttachments.length > 0) {
      setAttachments((currentAttachments) => [...currentAttachments, ...nextAttachments])
      setWorkspaceError('')
    }
  }

  function handleRemoveAttachment(attachmentId: string) {
    setAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  function handleSaveApiKey() {
    const trimmedKey = draftApiKey.trim()
    setSavedApiKey(trimmedKey)

    if (trimmedKey) {
      window.localStorage.setItem(OPENROUTER_KEY_STORAGE, trimmedKey)
      return
    }

    window.localStorage.removeItem(OPENROUTER_KEY_STORAGE)
  }

  function handleClearApiKey() {
    setDraftApiKey('')
    setSavedApiKey('')
    window.localStorage.removeItem(OPENROUTER_KEY_STORAGE)
  }

  function handleClearThread() {
    setTurns([])
    setAttachments([])
    setWorkspaceError('')
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      if (!isRunning) {
        void handleRunCollaboration()
      }
    }
  }

  function markRoundEntriesSkipped(
    turnId: string,
    roundId: CollaborationRoundId,
    skippedParticipants: ResolvedParticipant[],
    reason: string,
  ) {
    skippedParticipants.forEach((participant) => {
      updateRoundEntry(turnId, roundId, participant.id, (entry) => ({
        ...entry,
        status: entry.status === 'complete' ? entry.status : 'skipped',
        error: entry.error || reason,
      }))
    })
  }

  async function runParticipantStep(
    turnId: string,
    roundId: CollaborationRoundId,
    participant: ResolvedParticipant,
    userPrompt: string,
    expectedTags: string[],
    maxTokens: number,
  ): Promise<CollaborationStepRecord | null> {
    updateRoundEntry(turnId, roundId, participant.id, (entry) => ({
      ...entry,
      status: 'running',
      phase: null,
      text: '',
      reasoning: '',
      reasoningDetails: [],
      refusal: '',
      usage: null,
      parsed: {},
      error: '',
    }))

    const messages = [
      {
        role: 'system',
        content: participantSystemPrompt(participant),
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ] satisfies OpenRouterChatMessage[]

    try {
      const reply = await createOpenRouterChatCompletionStream({
        apiKey: savedApiKey,
        includeReasoning: Boolean(participant.profile?.supportsReasoning),
        maxTokens,
        messages,
        model: participant.modelId,
        reasoning: getReasoningConfig(participant),
        onProgress: (partialReply) => {
          updateRoundEntry(turnId, roundId, participant.id, (entry) => ({
            ...entry,
            status: 'running',
            phase: partialReply.phase,
            text: partialReply.text,
            reasoning: partialReply.reasoning,
            reasoningDetails: partialReply.reasoningDetails,
            refusal: partialReply.refusal,
            usage: partialReply.usage ?? null,
            parsed: parseRoundOutput(partialReply.text, expectedTags),
          }))
        },
      })
      const parsed = parseRoundOutput(reply.text, expectedTags)

      updateRoundEntry(turnId, roundId, participant.id, (entry) => ({
        ...entry,
        status: 'complete',
        phase: reply.phase,
        text: reply.text,
        reasoning: reply.reasoning,
        reasoningDetails: reply.reasoningDetails,
        refusal: reply.refusal,
        usage: reply.usage ?? null,
        parsed,
        error: '',
      }))

      return {
        participant,
        rawOutput: reply.text,
        parsed,
      } satisfies CollaborationStepRecord
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The model could not finish this round.'

      updateRoundEntry(turnId, roundId, participant.id, (entry) => ({
        ...entry,
        status: 'error',
        error: message,
      }))

      return null as CollaborationStepRecord | null
    }
  }

  const resolvedParticipants = participants.map((participant) => {
    const model = models.find((entry) => entry.id === participant.modelId)
    const profile = model ? getModelCapabilityProfile(model, null) : null

    return {
      ...participant,
      modelName: model?.name ?? 'Select a model',
      profile,
    } satisfies ResolvedParticipant
  })
  const judgeModelName =
    models.find((model) => model.id === judgeModelId)?.name ?? 'Select a model'

  async function runRound(
    turnId: string,
    roundId: CollaborationRoundId,
    activeParticipants: ResolvedParticipant[],
    buildPrompt: (participant: ResolvedParticipant) => string,
    expectedTags: string[],
    maxTokens: number,
  ): Promise<CollaborationStepRecord[]> {
    updateRoundStatus(turnId, roundId, 'running')

    const skippedParticipants = resolvedParticipants.filter(
      (participant) =>
        !activeParticipants.some((activeParticipant) => activeParticipant.id === participant.id),
    )

    if (skippedParticipants.length > 0) {
      markRoundEntriesSkipped(
        turnId,
        roundId,
        skippedParticipants,
        'Removed after an earlier round failed.',
      )
    }

    const results = await Promise.all(
      activeParticipants.map((participant) =>
        runParticipantStep(
          turnId,
          roundId,
          participant,
          buildPrompt(participant),
          expectedTags,
          maxTokens,
        ),
      ),
    )
    const successfulRecords = results.filter(
      (record): record is CollaborationStepRecord => record !== null,
    )

    updateRoundStatus(
      turnId,
      roundId,
      successfulRecords.length > 0 ? 'complete' : 'error',
    )

    return successfulRecords
  }

  async function runSynthesisStep(
    turnId: string,
    judge: ResolvedParticipant,
    userPrompt: string,
  ) {
    updateSynthesis(turnId, (synthesis) => ({
      ...synthesis,
      status: 'running',
      phase: null,
      text: '',
      reasoning: '',
      reasoningDetails: [],
      refusal: '',
      usage: null,
      parsed: {},
      error: '',
    }))

    try {
      const reply = await createOpenRouterChatCompletionStream({
        apiKey: savedApiKey,
        includeReasoning: Boolean(judge.profile?.supportsReasoning),
        maxTokens: 1000,
        messages: [
          {
            role: 'system',
            content: participantSystemPrompt({
              id: judge.id,
              alias: 'Final Judge',
              role: 'final synthesis judge focused on selecting the strongest answer',
              modelId: judge.modelId,
            }),
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ] satisfies OpenRouterChatMessage[],
        model: judge.modelId,
        reasoning: getReasoningConfig(judge),
        onProgress: (partialReply) => {
          updateSynthesis(turnId, (synthesis) => ({
            ...synthesis,
            status: 'running',
            phase: partialReply.phase,
            text: partialReply.text,
            reasoning: partialReply.reasoning,
            reasoningDetails: partialReply.reasoningDetails,
            refusal: partialReply.refusal,
            usage: partialReply.usage ?? null,
            parsed: parseRoundOutput(partialReply.text, [
              'final_answer',
              'confidence',
              'why_this_wins',
            ]),
          }))
        },
      })
      const parsed = parseRoundOutput(reply.text, [
        'final_answer',
        'confidence',
        'why_this_wins',
      ])

      updateSynthesis(turnId, (synthesis) => ({
        ...synthesis,
        status: 'complete',
        phase: reply.phase,
        text: reply.text,
        reasoning: reply.reasoning,
        reasoningDetails: reply.reasoningDetails,
        refusal: reply.refusal,
        usage: reply.usage ?? null,
        parsed,
        error: '',
      }))

      return true
    } catch (error) {
      updateSynthesis(turnId, (synthesis) => ({
        ...synthesis,
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'The synthesis model failed to produce a final answer.',
      }))

      return false
    }
  }

  async function executeCollaboration(
    turnId: string,
    prompt: string,
    activeParticipants: ResolvedParticipant[],
    judge: ResolvedParticipant,
  ) {
    try {
      let remainingParticipants = [...activeParticipants]

      const draftRecords = await runRound(
        turnId,
        'draft',
        remainingParticipants,
        () => buildIndependentRoundPrompt(prompt),
        ['draft_answer', 'confidence', 'key_points', 'uncertainties'],
        800,
      )

      if (draftRecords.length < 2) {
        throw new Error('At least two participants must finish the draft round.')
      }

      remainingParticipants = draftRecords.map((record) => record.participant as ResolvedParticipant)

      const selfCritiqueRecords = await runRound(
        turnId,
        'self_critique',
        remainingParticipants,
        (participant) => {
          const draftRecord = draftRecords.find(
            (record) => record.participant.id === participant.id,
          )

          return buildSelfCritiquePrompt(prompt, draftRecord?.rawOutput ?? '')
        },
        ['self_critique', 'confidence_after_self_critique', 'repair_plan'],
        700,
      )

      if (selfCritiqueRecords.length < 2) {
        throw new Error('At least two participants must finish the self-critique round.')
      }

      remainingParticipants = selfCritiqueRecords.map(
        (record) => record.participant as ResolvedParticipant,
      )

      const crossCritiqueRecords = await runRound(
        turnId,
        'cross_critique',
        remainingParticipants,
        (participant) => {
          const ownDraft = draftRecords.find((record) => record.participant.id === participant.id)
          const ownSelfCritique = selfCritiqueRecords.find(
            (record) => record.participant.id === participant.id,
          )

          return buildCrossCritiquePrompt(
            prompt,
            participant,
            ownDraft ?? {
              participant,
              rawOutput: '',
              parsed: {},
            },
            draftRecords,
            ownSelfCritique ?? {
              participant,
              rawOutput: '',
              parsed: {},
            },
          )
        },
        ['peer_critique', 'best_peer', 'what_you_missed'],
        850,
      )

      if (crossCritiqueRecords.length < 2) {
        throw new Error('At least two participants must finish the cross-critique round.')
      }

      remainingParticipants = crossCritiqueRecords.map(
        (record) => record.participant as ResolvedParticipant,
      )

      const revisedRecords = await runRound(
        turnId,
        'revision',
        remainingParticipants,
        (participant) => {
          const ownDraft = draftRecords.find((record) => record.participant.id === participant.id)
          const ownSelfCritique = selfCritiqueRecords.find(
            (record) => record.participant.id === participant.id,
          )

          return buildRevisionPrompt(
            prompt,
            ownDraft ?? {
              participant,
              rawOutput: '',
              parsed: {},
            },
            ownSelfCritique ?? {
              participant,
              rawOutput: '',
              parsed: {},
            },
            crossCritiqueRecords,
          )
        },
        ['revised_answer', 'confidence', 'why_better'],
        950,
      )

      if (revisedRecords.length < 2) {
        throw new Error('At least two participants must finish the revision round.')
      }

      remainingParticipants = revisedRecords.map(
        (record) => record.participant as ResolvedParticipant,
      )

      const auditRecords = await runRound(
        turnId,
        'audit',
        remainingParticipants,
        () => buildAuditPrompt(prompt, revisedRecords),
        ['scorecard', 'winner', 'audit_summary'],
        900,
      )

      const audit = aggregateAuditScores(auditRecords, revisedRecords)

      updateTurn(turnId, (turn) => ({
        ...turn,
        audit,
      }))

      const voteRecords = await runRound(
        turnId,
        'vote',
        remainingParticipants,
        () => buildVotePrompt(prompt, revisedRecords, audit.summary),
        ['selected_candidate', 'final_answer', 'confidence', 'rationale'],
        850,
      )
      const vote = determineVoteWinner(voteRecords)

      updateTurn(turnId, (turn) => ({
        ...turn,
        vote,
      }))

      const synthesisPrompt = buildSynthesisPrompt(
        prompt,
        revisedRecords,
        audit.summary,
        voteRecords,
      )
      const synthesisSucceeded = await runSynthesisStep(turnId, judge, synthesisPrompt)

      updateTurn(turnId, (turn) => ({
        ...turn,
        status: synthesisSucceeded ? 'complete' : 'error',
        error: synthesisSucceeded ? '' : 'The judge failed to finish the final synthesis.',
      }))
    } catch (error) {
      updateTurn(turnId, (turn) => ({
        ...turn,
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'The collaboration run could not finish.',
      }))
    } finally {
      setIsRunning(false)
    }
  }

  async function handleRunCollaboration() {
    const trimmedMessage = draftMessage.trim()

    if (!savedApiKey) {
      setWorkspaceError('Add and save an OpenRouter API key before running collaboration.')
      return
    }

    if (!trimmedMessage && attachments.length === 0) {
      return
    }

    if (resolvedParticipants.some((participant) => !participant.modelId || !participant.profile)) {
      setWorkspaceError('Pick a valid model for every participant first.')
      return
    }

    const distinctModels = new Set(resolvedParticipants.map((participant) => participant.modelId))

    if (distinctModels.size !== resolvedParticipants.length) {
      setWorkspaceError('Pick three different participant models.')
      return
    }

    const judgeModel = models.find((model) => model.id === judgeModelId)

    if (!judgeModel) {
      setWorkspaceError('Pick a valid judge model.')
      return
    }

    const resolvedJudge = {
      id: 'judge',
      alias: 'Final Judge',
      role: 'final synthesis judge focused on selecting the strongest answer',
      modelId: judgeModel.id,
      modelName: judgeModel.name,
      profile: getModelCapabilityProfile(judgeModel, null),
    } satisfies ResolvedParticipant

    const prompt = buildPromptPayload(trimmedMessage, attachments)
    const nextTurn = createTurn(prompt, attachments, resolvedParticipants, {
      modelId: resolvedJudge.modelId,
      modelName: resolvedJudge.modelName,
    })

    shouldAutoScrollRef.current = true
    setTurns((currentTurns) => [...currentTurns, nextTurn])
    setWorkspaceError('')
    setDraftMessage('')
    setAttachments([])
    setIsRunning(true)

    if (composerTextareaRef.current) {
      composerTextareaRef.current.style.height = `${COLLAB_COMPOSER_BASE_HEIGHT}px`
    }

    void executeCollaboration(nextTurn.id, prompt, resolvedParticipants, resolvedJudge)
  }

  return (
    <section className="collab-home section" id="chat">
      <div className="collab-shell">
        <details className="collab-settings" open={!savedApiKey || turns.length === 0}>
          <summary className="collab-settings-summary">
            <div className="collab-settings-copy">
              <strong>Room</strong>
              <span>
                GPT, Gemini, and DeepSeek argue live. Argue renders any plaintext
                reasoning OpenRouter exposes.
              </span>
            </div>
            <ChevronDown className="workspace-collapsible-chevron" size={16} />
          </summary>

          <div className="collab-settings-grid">
            <section className="collab-settings-block">
              <header>
                <strong>API key</strong>
              </header>
              <input
                autoComplete="off"
                className="auth-input"
                onChange={(event) => setDraftApiKey(event.target.value)}
                placeholder="sk-or-v1-..."
                spellCheck={false}
                type="password"
                value={draftApiKey}
              />
              <div className="collab-settings-actions">
                <button className="button button-primary" onClick={handleSaveApiKey} type="button">
                  Save key
                </button>
                <button className="button button-secondary" onClick={handleClearApiKey} type="button">
                  Clear
                </button>
              </div>
            </section>

            <section className="collab-settings-block collab-settings-block-wide">
              <header className="collab-settings-block-header">
                <strong>Participants</strong>
                <button
                  className="button button-secondary"
                  disabled={modelsLoading}
                  onClick={() => void loadModels()}
                  type="button"
                >
                  {modelsLoading ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <RefreshCcw size={16} />
                  )}
                  Refresh
                </button>
              </header>

              {modelsError ? <p className="workspace-error">{modelsError}</p> : null}

              <div className="collab-roster-grid">
                {resolvedParticipants.map((participant) => (
                  <label className="collab-select-field" key={participant.id}>
                    <span>{participant.alias}</span>
                    <select
                      onChange={(event) =>
                        setParticipants((currentParticipants) =>
                          currentParticipants.map((entry) =>
                            entry.id === participant.id
                              ? {
                                  ...entry,
                                  modelId: event.target.value,
                                }
                              : entry,
                          ),
                        )
                      }
                      value={participant.modelId}
                    >
                      <option value="">Select a model</option>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      {participant.profile
                        ? `${participant.profile.reasoningExposure.badge} · ${participant.role}`
                        : participant.role}
                    </small>
                  </label>
                ))}

                <label className="collab-select-field">
                  <span>Judge</span>
                  <select onChange={(event) => setJudgeModelId(event.target.value)} value={judgeModelId}>
                    <option value="">Select a model</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  <small>{judgeModelName}</small>
                </label>
              </div>
            </section>
          </div>
        </details>

        {workspaceError ? <p className="workspace-error">{workspaceError}</p> : null}

        <div className="collab-stack" onScroll={handleMessageStackScroll} ref={stackRef}>
          {turns.length === 0 ? (
            <div className="collab-empty">
              <p>
                Ask one problem. Three models will draft, criticize, revise, audit,
                vote, and synthesize in place.
              </p>
            </div>
          ) : null}

          {turns.map((turn) => (
            <article className="collab-turn" key={turn.id}>
              <header className="collab-turn-header">
                <div className="collab-turn-prompt">
                  <span>Prompt</span>
                  <p>{turn.prompt}</p>
                </div>
                <div className={`collab-turn-state collab-turn-state-${turn.status}`}>
                  {turn.status}
                </div>
              </header>

              {turn.attachments.length > 0 ? (
                <div className="collab-attachment-row">
                  {turn.attachments.map((attachment) => (
                    <article className="collab-attachment-pill" key={attachment.id}>
                      <strong>{attachment.name}</strong>
                      <span>{attachment.summary}</span>
                    </article>
                  ))}
                </div>
              ) : null}

              {turn.rounds.map((round) => (
                <section className="collab-round" key={round.id}>
                  <header className="collab-round-header">
                    <strong>{round.title}</strong>
                    <span>{round.description}</span>
                  </header>

                  <div className="collab-panel-grid">
                    {round.entries.map((entry) => (
                      <article className={`collab-panel collab-panel-${entry.status}`} key={entry.participantId}>
                        <header className="collab-panel-header">
                          <div>
                            <strong>{entry.alias}</strong>
                            <span>{entry.modelName}</span>
                          </div>
                          <div className="collab-panel-meta">
                            <span>{entry.reasoningBadge}</span>
                            <span>{entry.phase ?? entry.status}</span>
                          </div>
                        </header>

                        {entry.error ? <p className="workspace-error">{entry.error}</p> : null}

                        <RichMessageContent
                          isStreaming={entry.status === 'running'}
                          reasoning={entry.reasoning}
                          reasoningDetails={entry.reasoningDetails}
                          refusal={entry.refusal}
                          text={entry.text}
                        />

                        {!entry.reasoning && entry.reasoningDetails.length === 0 && entry.status === 'complete' ? (
                          <p className="collab-provider-note">
                            This model finished the round without exposing plaintext
                            reasoning.
                          </p>
                        ) : null}

                        <StructuredOutput parsed={entry.parsed} />
                      </article>
                    ))}
                  </div>
                </section>
              ))}

              {turn.audit ? (
                <section className="collab-summary-panel">
                  <header>
                    <strong>Audit</strong>
                    <span>{turn.audit.winner}</span>
                  </header>
                  <pre>{turn.audit.summary}</pre>
                </section>
              ) : null}

              {turn.vote ? (
                <section className="collab-summary-panel">
                  <header>
                    <strong>Vote</strong>
                    <span>{turn.vote.winner}</span>
                  </header>
                  <div className="collab-vote-grid">
                    {Object.entries(turn.vote.counts).map(([candidate, count]) => (
                      <article className="collab-vote-item" key={candidate}>
                        <strong>{candidate}</strong>
                        <span>{count}</span>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="collab-summary-panel collab-summary-panel-final">
                <header>
                  <strong>Final synthesis</strong>
                  <span>{turn.synthesis.modelName}</span>
                </header>

                {turn.synthesis.error ? <p className="workspace-error">{turn.synthesis.error}</p> : null}

                <RichMessageContent
                  isStreaming={turn.synthesis.status === 'running'}
                  reasoning={turn.synthesis.reasoning}
                  reasoningDetails={turn.synthesis.reasoningDetails}
                  refusal={turn.synthesis.refusal}
                  text={turn.synthesis.text}
                />

                <StructuredOutput parsed={turn.synthesis.parsed} />
              </section>

              {turn.error ? <p className="workspace-error">{turn.error}</p> : null}
            </article>
          ))}
        </div>

        <input
          accept={CODE_FILE_ACCEPT}
          className="workspace-file-input"
          multiple
          onChange={handleAttachmentSelection}
          ref={attachmentInputRef}
          type="file"
        />

        <div className="collab-composer">
          {attachments.length > 0 ? (
            <div className="collab-composer-attachments">
              {attachments.map((attachment) => (
                <article className="collab-composer-attachment" key={attachment.id}>
                  <div>
                    <strong>{attachment.name}</strong>
                    <span>{attachment.summary}</span>
                  </div>
                  <button
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() => handleRemoveAttachment(attachment.id)}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          <div className="collab-input-row">
            <button
              aria-label="Add text file"
              className="collab-icon-button"
              onClick={() => attachmentInputRef.current?.click()}
              type="button"
            >
              <Paperclip size={15} />
            </button>
            <textarea
              className="collab-textarea"
              onChange={handleDraftMessageChange}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask one hard question"
              ref={composerTextareaRef}
              rows={1}
              spellCheck={false}
              value={draftMessage}
            />
            <button
              aria-label="Run collaboration"
              className="collab-icon-button"
              disabled={isRunning || (!draftMessage.trim() && attachments.length === 0)}
              onClick={() => void handleRunCollaboration()}
              type="button"
            >
              <ArrowUp size={15} />
            </button>
          </div>

          <div className="collab-composer-actions">
            <button className="button button-secondary" onClick={handleClearThread} type="button">
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export { CollaborationWorkspace }
