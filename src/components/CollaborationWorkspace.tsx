// CollaborationWorkspace — redesign in progress
import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import type { User } from 'firebase/auth'
import { ArrowUp, Square, Paperclip, Mic, ChevronDown, Search, X, Info, Copy, Pencil, Check } from 'lucide-react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import {
  fetchOpenRouterModels,
  getInitialOpenRouterModels,
  createOpenRouterChatCompletionStream,
  createOpenRouterChatCompletion,
  type OpenRouterModel,
  type OpenRouterChatMessage,
  type OpenRouterReasoningEffort,
  type OpenRouterUrlCitation,
} from '../lib/openrouter'
import { OPENROUTER_KEY_STORAGE } from '../lib/openrouterStorage'
import {
  isBrowserManagedOpenRouter,
} from '../lib/runtimeConfig'
import { MarkdownBlock } from './RichMessageContent'
import {
  fetchOpenRouterStatsSnapshot,
  resolveOpenRouterModelStats,
  type OpenRouterStatsSnapshot,
  type OpenRouterModelStatsEntry,
} from '../lib/openrouterStats'
import { ModelStatsPanel } from './ModelStatsPanel'
import { db } from '../lib/firebase'

const SYSTEM_PROMPT = `You are a helpful assistant. Format your responses using Markdown.

Formatting rules:
- **Math**: Use $...$ for inline math and $$...$$ for display/block equations. Do NOT use \\( \\) or \\[ \\] — use $ and $$ only.
- **Tables**: Use GFM Markdown tables (pipes | and dashes ---) for any tabular data.
- **Code**: Use fenced code blocks with a language hint, e.g. \`\`\`python.
- **LaTeX documents**: When a rendered document is useful, return the full document in a fenced \`\`\`latex block. Argue opens \`latex\` blocks in an editable source + PDF preview workspace, so do not tell the user to save files or run \`pdflatex\` unless they explicitly ask for terminal instructions.
- **Lists**: Use - for bullet lists, 1. for numbered lists.
- **Bold/italic**: Use **bold** and *italic* for emphasis.
Keep responses clear and well-structured.`

interface CollaborationWorkspaceProps {
  currentUser?: User | null
}

interface AttachedFile {
  id: string
  name: string
  dataUrl: string
  mimeType: string
}

type SavedAttachment = {
  id: string
  name: string
  dataUrl: string
  mimeType: string
}

// ---- Group collaboration types ----
interface GroupModelRun {
  participantId: string
  modelId: string
  modelName: string
  roleLabel: string
  content: string
  reasoning?: string
  thinkingMs?: number
  status: 'pending' | 'thinking' | 'done'
}

interface GroupPhase {
  label: string
  runs: GroupModelRun[]
}

interface GroupData {
  phases: GroupPhase[]
  currentPhaseIndex: number
  currentRunLabel: string     // e.g. "GPT-5.4 is thinking…"
  synthesis: string
  synthesisStreaming: boolean
  synthesisModelName: string
  complete: boolean
}

interface GroupParticipantConfig {
  id: string
  enabled: boolean
  lead: boolean
  modelId: string
  roleLabel: string
  roleBrief: string
  maxTokens: number
  useReasoning: boolean
}

type ActiveGroupParticipant = GroupParticipantConfig & {
  model: OpenRouterModel
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AttachedFile[]
  streaming?: boolean
  error?: boolean
  reasoning?: string
  isReasoningModel?: boolean
  thinkingStart?: number
  thinkingDuration?: number
  stoppedThinking?: boolean   // true if user stopped during thinking phase
  webSearch?: {
    enabled: boolean
    approximateQuery: string
    citations: OpenRouterUrlCitation[]
    searching: boolean
  }
  groupData?: GroupData
}

type SavedChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: SavedAttachment[]
  streaming?: boolean
  error?: boolean
  reasoning?: string
  isReasoningModel?: boolean
  thinkingDuration?: number
  stoppedThinking?: boolean
  webSearch?: {
    enabled: boolean
    approximateQuery: string
    citations: OpenRouterUrlCitation[]
    searching: boolean
  }
  groupData?: GroupData
}

type SavedChat = {
  id: string
  title: string
  preview: string
  modelId: string | null
  modelName: string | null
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any
  }
}

function isMultimodal(model: OpenRouterModel) {
  const inputs = model.architecture?.input_modalities ?? []
  return inputs.some((m) => m === 'image' || m === 'file')
}

type ReasoningStyle = 'effort' | 'include' | 'none'

/** Determine how this model surfaces reasoning to callers.
 *  - 'effort': has the `reasoning` param (object with effort/summary/etc) — all major reasoning models
 *  - 'include': only has `include_reasoning` toggle, no effort control
 *  - 'none': no reasoning params at all
 */
function getReasoningStyle(model: OpenRouterModel): ReasoningStyle {
  const params = new Set((model.supported_parameters ?? []).map((p) => p.toLowerCase()))
  if (params.has('reasoning')) return 'effort'          // GPT-5.4, Claude, Gemini, DeepSeek, etc.
  if (params.has('include_reasoning')) return 'include' // binary-only toggle
  return 'none'
}

const EFFORT_LEVELS: { value: OpenRouterReasoningEffort; label: string; desc: string }[] = [
  { value: 'xhigh',   label: 'Max',     desc: 'Best for extremely hard math proofs, novel research questions, and multi-step competitive programming. Highest cost and latency.' },
  { value: 'high',    label: 'High',    desc: 'Best for complex coding, multi-step reasoning, and detailed analysis. Good balance of depth and speed.' },
  { value: 'medium',  label: 'Medium',  desc: 'Best for everyday questions, summarization, and moderate reasoning tasks. Faster and cheaper.' },
  { value: 'low',     label: 'Low',     desc: 'Best for simple Q&A, quick lookups, and straightforward tasks. Fast responses.' },
  { value: 'minimal', label: 'Minimal', desc: 'Near-instant responses with almost no internal reasoning. Best for trivial tasks and autocomplete-style use.' },
]

const GROUP_ONE_ID = '__group_1__'
const GROUP_ONE: OpenRouterModel = {
  id: GROUP_ONE_ID,
  name: 'Group 1',
  description: 'Configurable multi-model debate room with editable roles, budgets, and rounds.',
  pricing: { prompt: '0', completion: '0', web_search: '0' },
  supported_parameters: ['reasoning'],
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
}

const MIN_GROUP_PARTICIPANTS = 2
const MIN_GROUP_DEBATE_ROUNDS = 1
const MAX_GROUP_DEBATE_ROUNDS = 4
const MIN_GROUP_MAX_TOKENS = 256
const MAX_GROUP_MAX_TOKENS = 8192

const DEFAULT_GROUP_PARTICIPANTS: GroupParticipantConfig[] = [
  {
    id: 'lead',
    enabled: true,
    lead: true,
    modelId: 'openai/gpt-5.4',
    roleLabel: 'Builder',
    roleBrief: 'Own the implementation path and deliver the most complete solution.',
    maxTokens: 2200,
    useReasoning: true,
  },
  {
    id: 'analyst',
    enabled: true,
    lead: false,
    modelId: 'google/gemini-3.1-pro-preview',
    roleLabel: 'Analyst',
    roleBrief: 'Break the problem down, surface edge cases, and stress-test assumptions.',
    maxTokens: 1800,
    useReasoning: false,
  },
  {
    id: 'adversary',
    enabled: true,
    lead: false,
    modelId: 'anthropic/claude-opus-4.6',
    roleLabel: 'Adversary',
    roleBrief: 'Challenge weak logic, find missing pieces, and push for a stronger final answer.',
    maxTokens: 2200,
    useReasoning: true,
  },
]

const GROUP_SYSTEM_PROMPT = `You are participating in a multi-model collaborative problem-solving session.
Format responses using Markdown. Use $...$ for inline math and $$...$$ for block equations.
Use fenced code blocks with language hints (e.g. \`\`\`python). Be thorough and precise.`

/** Ensure **Title** section headers in reasoning text appear on their own paragraph. */
function normalizeReasoningText(text: string): string {
  return text.replace(/([^\n])(\*\*[A-Z][^*\n]{0,80}\*\*)/g, '$1\n\n$2')
}

type ThinkingIndicatorTone = 'default' | 'pulse' | 'stopped'

function getThinkingIndicator(message: ChatMessage): { label: string; tone: ThinkingIndicatorTone } {
  if (message.streaming && !message.content && !message.reasoning) {
    return { label: 'Thinking…', tone: 'pulse' }
  }

  if (message.stoppedThinking) {
    return { label: 'Stopped thinking', tone: 'stopped' }
  }

  if (message.thinkingDuration != null) {
    return { label: `Thought for ${Math.round(message.thinkingDuration / 1000)}s`, tone: 'default' }
  }

  if (message.streaming) {
    return { label: 'Thinking…', tone: 'pulse' }
  }

  return { label: 'Thoughts', tone: 'default' }
}

function buildApiMessages(messages: ChatMessage[]): OpenRouterChatMessage[] {
  const history: OpenRouterChatMessage[] = messages
    .filter((m) => !m.streaming && !m.error)
    .map((m): OpenRouterChatMessage => {
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [{ type: 'text', text: m.content }]
        for (const att of m.attachments) {
          if (att.mimeType.startsWith('image/')) {
            parts.push({ type: 'image_url', image_url: { url: att.dataUrl } })
          }
        }
        return { role: 'user', content: parts }
      }
      return { role: m.role, content: m.content }
    })
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
}

type WebSearchModelCategory = 'free' | 'metered' | 'unsupported'

function formatWebSearchPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return 'Web search'
  }

  if (value === 0) {
    return 'Free web search'
  }

  return `$${value.toFixed(value >= 0.1 ? 2 : 3).replace(/0+$/, '').replace(/\.$/, '')}/search`
}

function getWebSearchModelProfile(model: OpenRouterModel | null) {
  if (!model) {
    return {
      supported: false,
      category: 'unsupported' as WebSearchModelCategory,
      price: null,
      priceLabel: 'Web search unavailable',
      providerLabel: 'Standard',
    }
  }

  const rawPrice = model.pricing?.web_search

  if (rawPrice == null) {
    return {
      supported: false,
      category: 'unsupported' as WebSearchModelCategory,
      price: null,
      priceLabel: 'Web search unavailable',
      providerLabel: model.id.split('/')[0],
    }
  }

  const numericPrice = Number(rawPrice)
  const category: WebSearchModelCategory = numericPrice === 0 ? 'free' : 'metered'

  return {
    supported: true,
    category,
    price: Number.isFinite(numericPrice) ? numericPrice : null,
    priceLabel: formatWebSearchPrice(Number.isFinite(numericPrice) ? numericPrice : null),
    providerLabel: model.id.split('/')[0],
  }
}

function clampWholeNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, Math.round(value)))
}

function findOpenRouterModelById(models: OpenRouterModel[], id: string) {
  return (
    models.find((model) => model.id === id) ??
    getInitialOpenRouterModels().find((model) => model.id === id) ??
    null
  )
}

function normalizeGroupParticipants(participants: GroupParticipantConfig[]) {
  const enabledParticipants = participants.filter((participant) => participant.enabled)
  const leadId =
    enabledParticipants.find((participant) => participant.lead)?.id ??
    enabledParticipants[0]?.id ??
    null

  return participants.map((participant) => ({
    ...participant,
    lead: Boolean(leadId && participant.enabled && participant.id === leadId),
    maxTokens: clampWholeNumber(
      participant.maxTokens,
      MIN_GROUP_MAX_TOKENS,
      MAX_GROUP_MAX_TOKENS,
    ),
  }))
}

function getActiveGroupParticipants(
  participants: GroupParticipantConfig[],
  models: OpenRouterModel[],
): ActiveGroupParticipant[] {
  return participants
    .filter((participant) => participant.enabled)
    .map((participant) => {
      const model = findOpenRouterModelById(models, participant.modelId)

      if (!model) {
        return null
      }

      return {
        ...participant,
        model,
      } satisfies ActiveGroupParticipant
    })
    .filter((participant): participant is ActiveGroupParticipant => participant !== null)
}

function getLeadGroupParticipant(participants: ActiveGroupParticipant[]) {
  return participants.find((participant) => participant.lead) ?? participants[0] ?? null
}

function getReasoningEffortLabel(value: OpenRouterReasoningEffort) {
  return EFFORT_LEVELS.find((level) => level.value === value)?.label ?? 'High'
}

function getGroupModelSummary(
  participants: GroupParticipantConfig[],
  models: OpenRouterModel[],
) {
  const names = getActiveGroupParticipants(participants, models)
    .map((participant) => participant.model.name)

  return names.length > 0 ? names.join(' · ') : 'Choose at least two models'
}

function normalizeChatTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  const text = firstUserMessage?.content.trim() ?? ''
  if (!text) {
    return 'New chat'
  }
  return text.length > 48 ? `${text.slice(0, 48).trimEnd()}…` : text
}

async function generateChatTitle(userMessage: string, assistantReply: string, apiKey: string): Promise<string | null> {
  try {
    const result = await createOpenRouterChatCompletion({
      apiKey,
      model: 'openai/gpt-4o-mini',
      maxTokens: 20,
      messages: [
        {
          role: 'system',
          content: 'Generate a 2-5 word title for this conversation. No quotes, no punctuation at the end. Just the short title.',
        },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantReply.slice(0, 200) },
        { role: 'user', content: 'Title:' },
      ],
    })
    const title = result.text?.trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '')
    return title && title.length > 0 && title.length <= 50 ? title : null
  } catch {
    return null
  }
}

function normalizeChatPreview(messages: ChatMessage[]) {
  const latestMessage = [...messages]
    .reverse()
    .find((message) => message.content.trim() || (message.attachments?.length ?? 0) > 0)
  if (!latestMessage) {
    return 'Empty'
  }
  const base =
    latestMessage.content.trim() ||
    latestMessage.attachments?.map((file) => file.name).join(', ') ||
    'Attachment'
  return base.length > 80 ? `${base.slice(0, 80).trimEnd()}…` : base
}

function timestampToMillis(value: Timestamp | null | undefined) {
  return value instanceof Timestamp ? value.toMillis() : 0
}

function serializeMessages(messages: ChatMessage[]): SavedChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.attachments ? {
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        dataUrl: attachment.dataUrl,
        mimeType: attachment.mimeType,
      })),
    } : {}),
    ...(message.streaming !== undefined && { streaming: message.streaming }),
    ...(message.error !== undefined && { error: message.error }),
    ...(message.reasoning !== undefined && { reasoning: message.reasoning }),
    ...(message.isReasoningModel !== undefined && { isReasoningModel: message.isReasoningModel }),
    ...(message.thinkingDuration !== undefined && { thinkingDuration: message.thinkingDuration }),
    ...(message.stoppedThinking !== undefined && { stoppedThinking: message.stoppedThinking }),
    ...(message.webSearch ? { webSearch: message.webSearch } : {}),
    ...(message.groupData ? { groupData: message.groupData } : {}),
  }))
}

function deserializeMessages(messages: SavedChatMessage[] | undefined): ChatMessage[] {
  return (messages ?? []).map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => ({ ...attachment })),
    webSearch: message.webSearch
      ? {
          ...message.webSearch,
          citations: [...message.webSearch.citations],
        }
      : undefined,
    groupData: message.groupData
      ? {
          ...message.groupData,
          phases: message.groupData.phases.map((phase) => ({
            ...phase,
            runs: phase.runs.map((run) => ({ ...run })),
          })),
        }
      : undefined,
  }))
}

function formatChatTime(value: number) {
  if (!value) {
    return ''
  }
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}



export function CollaborationWorkspace({ currentUser }: CollaborationWorkspaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chats, setChats] = useState<SavedChat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatListReady, setChatListReady] = useState(false)
  const [chatSyncError, setChatSyncError] = useState('')
  const [prompt, setPrompt] = useState('')
  const [listening, setListening] = useState(false)
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [streaming, setStreaming] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeThinkingMessageId, setActiveThinkingMessageId] = useState<string | null>(null)
  const [reasoningEffort, setReasoningEffort] = useState<OpenRouterReasoningEffort>('high')
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [groupDebateRounds, setGroupDebateRounds] = useState(2)
  const [groupReasoningEffort, setGroupReasoningEffort] = useState<OpenRouterReasoningEffort>('high')
  const [groupCustomizationOpen, setGroupCustomizationOpen] = useState(true)
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipantConfig[]>(
    () => normalizeGroupParticipants(DEFAULT_GROUP_PARTICIPANTS.map((participant) => ({ ...participant }))),
  )
  const [effortOpen, setEffortOpen] = useState(false)
  const effortDropRef = useRef<HTMLDivElement>(null)

  // model selector
  const [models, setModels] = useState<OpenRouterModel[]>(() =>
    getInitialOpenRouterModels(),
  )
  const [modelCatalogNotice, setModelCatalogNotice] = useState('')
  const [selectedModel, setSelectedModel] = useState<OpenRouterModel | null>(null)
  const [modelSearch, setModelSearch] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const modelSearchRef = useRef<HTMLInputElement>(null)
  const modelDropRef = useRef<HTMLDivElement>(null)

  // model info panel
  const [infoModel, setInfoModel] = useState<OpenRouterModel | null>(null)
  const [statsSnapshot, setStatsSnapshot] = useState<OpenRouterStatsSnapshot | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const abortedRef = useRef(false)
  const userKeyRequired = isBrowserManagedOpenRouter()
  const hydratedChatIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const aiTitlesRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false

    fetchOpenRouterModels()
      .then((result) => {
        if (cancelled) return

        setModels(result.models)
        setModelCatalogNotice(result.warning ?? '')
      })
      .catch((error) => {
        console.error('Failed to load the OpenRouter model catalog.', error)

        if (cancelled) return

        setModels(getInitialOpenRouterModels())
        setModelCatalogNotice(
          'Showing the built-in starter catalog because the model list could not be loaded on this network.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentUser) {
      setChats([])
      setActiveChatId(null)
      setMessages([])
      setChatListReady(false)
      return
    }

    const chatsQuery = query(
      collection(db, 'users', currentUser.uid, 'chats'),
      orderBy('updatedAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const nextChats = snapshot.docs.map((chatDoc) => {
          const data = chatDoc.data() as {
            title?: string
            preview?: string
            modelId?: string | null
            modelName?: string | null
            createdAt?: Timestamp
            updatedAt?: Timestamp
            messages?: SavedChatMessage[]
          }

          return {
            id: chatDoc.id,
            title: data.title ?? 'New chat',
            preview: data.preview ?? 'Empty',
            modelId: data.modelId ?? null,
            modelName: data.modelName ?? null,
            createdAt: timestampToMillis(data.createdAt),
            updatedAt: timestampToMillis(data.updatedAt),
            messages: deserializeMessages(data.messages),
          }
        })

        setChats(nextChats)
        setChatListReady(true)
        setChatSyncError('')

        if (nextChats.length === 0) {
          hydratedChatIdRef.current = null
          setActiveChatId(null)
          setMessages([])
          return
        }

        setActiveChatId((currentChatId) => {
          if (currentChatId && nextChats.some((chat) => chat.id === currentChatId)) {
            return currentChatId
          }
          return nextChats[0].id
        })
      },
      () => {
        setChatListReady(true)
        setChatSyncError('Could not load chats.')
      },
    )

    return unsubscribe
  }, [currentUser])

  useEffect(() => {
    if (!activeChatId) {
      if (!chatListReady) {
        return
      }
      hydratedChatIdRef.current = null
      setMessages([])
      return
    }

    if (hydratedChatIdRef.current === activeChatId) {
      return
    }

    const activeChat = chats.find((chat) => chat.id === activeChatId)
    if (!activeChat) {
      return
    }

    hydratedChatIdRef.current = activeChatId
    setMessages(deserializeMessages(activeChat.messages))
    setPrompt('')
    setAttachments([])
    setEditingId(null)

    if (activeChat.modelId) {
      const nextModel =
        activeChat.modelId === GROUP_ONE_ID
          ? GROUP_ONE
          : findOpenRouterModelById(models, activeChat.modelId)
      if (nextModel) {
        setSelectedModel(nextModel)
      }
    }
  }, [activeChatId, chatListReady, chats, models])

  useEffect(() => {
    if (!currentUser || !activeChatId || hydratedChatIdRef.current !== activeChatId) {
      return
    }

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      const activeChat = chats.find((chat) => chat.id === activeChatId)
      const chatTitle = aiTitlesRef.current.get(activeChatId) ?? normalizeChatTitle(messages)

      void setDoc(
        doc(db, 'users', currentUser.uid, 'chats', activeChatId),
        {
          title: chatTitle,
          preview: normalizeChatPreview(messages),
          modelId: selectedModel?.id ?? activeChat?.modelId ?? null,
          modelName: selectedModel?.name ?? activeChat?.modelName ?? null,
          createdAt: activeChat?.createdAt
            ? Timestamp.fromMillis(activeChat.createdAt)
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
          messages: serializeMessages(messages),
        },
        { merge: true },
      ).catch(() => {
        setChatSyncError('Could not save chat.')
      })

      // Generate AI title after first completed assistant message
      const firstUser = messages.find((m) => m.role === 'user')
      const firstAssistant = messages.find((m) => m.role === 'assistant' && !m.streaming && !m.error && m.content.trim())
      if (
        firstUser &&
        firstAssistant &&
        !aiTitlesRef.current.has(activeChatId)
      ) {
        aiTitlesRef.current.set(activeChatId, '') // mark as pending
        const apiKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
        if (apiKey) {
          void generateChatTitle(firstUser.content, firstAssistant.content, apiKey).then((aiTitle) => {
            if (aiTitle) {
              aiTitlesRef.current.set(activeChatId, aiTitle)
              void setDoc(
                doc(db, 'users', currentUser.uid, 'chats', activeChatId),
                { title: aiTitle },
                { merge: true },
              )
            }
          })
        }
      }
    }, 300)

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [activeChatId, chats, currentUser, messages, selectedModel])

  async function createChat() {
    if (!currentUser || streaming) {
      return
    }

    const chatRef = doc(collection(db, 'users', currentUser.uid, 'chats'))
    await setDoc(chatRef, {
      title: 'New chat',
      preview: 'Empty',
      modelId: selectedModel?.id ?? null,
      modelName: selectedModel?.name ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messages: [],
    })

    hydratedChatIdRef.current = chatRef.id
    setActiveChatId(chatRef.id)
    setMessages([])
    setPrompt('')
    setAttachments([])
    setEditingId(null)
  }

  function openChat(chatId: string) {
    if (streaming || chatId === activeChatId) {
      return
    }
    hydratedChatIdRef.current = null
    setActiveChatId(chatId)
  }

  useEffect(() => {
    if (!activeThinkingMessageId) {
      return
    }

    const hasSelectedThinkingTrace = messages.some(
      (message) =>
        message.id === activeThinkingMessageId &&
        message.role === 'assistant' &&
        message.isReasoningModel &&
        Boolean(message.reasoning?.trim()),
    )

    if (!hasSelectedThinkingTrace) {
      setActiveThinkingMessageId(null)
    }
  }, [messages, activeThinkingMessageId])

  useEffect(() => {
    if (!activeThinkingMessageId) {
      return
    }

    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveThinkingMessageId(null)
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => window.removeEventListener('keydown', handleWindowKeyDown)
  }, [activeThinkingMessageId])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setModelSearch('')
      }
      if (effortDropRef.current && !effortDropRef.current.contains(e.target as Node)) {
        setEffortOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (modelOpen) setTimeout(() => modelSearchRef.current?.focus(), 40)
  }, [modelOpen])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript
      setPrompt(transcript)
      autoResize()
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
  }, [])

  // Track whether user has scrolled away from the bottom
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return
    lastScrollTopRef.current = el.scrollTop

    const onScroll = () => {
      const scrolledUp = el.scrollTop < lastScrollTopRef.current
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24

      if (scrolledUp) {
        shouldAutoScrollRef.current = false
      } else if (nearBottom) {
        shouldAutoScrollRef.current = true
      }

      lastScrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Smart auto-scroll: only follow the bottom if the user hasn't scrolled up
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el || !shouldAutoScrollRef.current) return

    el.scrollTop = el.scrollHeight
    lastScrollTopRef.current = el.scrollTop
  }, [messages])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }

  function toggleVoice() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) { rec.stop(); setListening(false) }
    else { rec.start(); setListening(true) }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => setAttachments((prev) => [...prev, {
        id: crypto.randomUUID(), name: file.name,
        dataUrl: reader.result as string, mimeType: file.type,
      }])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  function getStoredOpenRouterKey() {
    if (!userKeyRequired) {
      return ''
    }

    return window.localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
  }

  function pushAssistantError(message: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: message,
        error: true,
      },
    ])
  }

  function getMissingCredentialMessage() {
    if (userKeyRequired) {
      return 'Add your OpenRouter API key in Account -> Settings to start a run.'
    }

    return 'This deployment is missing its server-side OpenRouter key. Set OPENROUTER_API_KEY on the backend and redeploy.'
  }

  function openInfoPanel(e: React.MouseEvent, model: OpenRouterModel) {
    e.stopPropagation()
    setInfoModel(model)
    if (!statsSnapshot && !statsLoading) {
      setStatsLoading(true)
      fetchOpenRouterStatsSnapshot()
        .then((snap) => { setStatsSnapshot(snap); setStatsLoading(false) })
        .catch(() => { setStatsError('Could not load stats.'); setStatsLoading(false) })
    }
  }

  function updateGroupParticipant(
    participantId: string,
    updater: (participant: GroupParticipantConfig) => GroupParticipantConfig,
  ) {
    setGroupParticipants((prev) =>
      normalizeGroupParticipants(
        prev.map((participant) =>
          participant.id === participantId ? updater(participant) : participant,
        ),
      ),
    )
  }

  function setGroupLead(participantId: string) {
    setGroupParticipants((prev) =>
      normalizeGroupParticipants(
        prev.map((participant) => ({
          ...participant,
          lead: participant.id === participantId && participant.enabled,
        })),
      ),
    )
  }

  async function runStream(historyBefore: ChatMessage[], userMsg: ChatMessage) {
    const apiKey = getStoredOpenRouterKey()
    if ((userKeyRequired && !apiKey.trim()) || !selectedModel) return

    const style = getReasoningStyle(selectedModel)
    const includeReasoning = style !== 'none'
    const reasoningConfig = style === 'effort' ? { effort: reasoningEffort } : undefined

    const isReasoningModel = style !== 'none'
    const selectedWebSearchProfile = getWebSearchModelProfile(selectedModel)
    const webSearchRequested = selectedWebSearchProfile.supported && webSearchEnabled
    const approximateSearchQuery = userMsg.content.trim() || 'Attached content'
    const assistantId = crypto.randomUUID()
    const thinkingStart = Date.now()
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        thinkingStart,
        isReasoningModel,
        webSearch: webSearchRequested
          ? {
              enabled: true,
              approximateQuery: approximateSearchQuery,
              citations: [],
              searching: true,
            }
          : undefined,
      },
    ])
    setStreaming(true)
    abortedRef.current = false

    const apiMessages = buildApiMessages([...historyBefore, userMsg])

    try {
      const finalReply = await createOpenRouterChatCompletionStream({
        apiKey,
        model: selectedModel.id,
        messages: apiMessages,
        includeReasoning,
        reasoning: reasoningConfig,
        plugins: webSearchRequested ? [{ id: 'web' }] : undefined,
        webSearchOptions: webSearchRequested
          ? { search_context_size: 'high' }
          : undefined,
        onProgress: (reply) => {
          if (abortedRef.current) return
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m
              const thinkingDuration =
                reply.text && !m.thinkingDuration
                  ? Date.now() - (m.thinkingStart ?? thinkingStart)
                  : m.thinkingDuration
              return {
                ...m,
                content: reply.text,
                reasoning: reply.reasoning || m.reasoning,
                thinkingDuration,
                webSearch: m.webSearch
                  ? {
                      ...m.webSearch,
                      citations:
                        reply.citations.length > 0
                          ? reply.citations
                          : m.webSearch.citations,
                      searching: !reply.text && reply.citations.length === 0,
                    }
                  : undefined,
              }
            })
          )
        },
      })
      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalReply.text,
                  reasoning: finalReply.reasoning || m.reasoning,
                  streaming: false,
                  thinkingDuration: m.thinkingDuration ?? (Date.now() - thinkingStart),
                  webSearch: m.webSearch
                    ? {
                        ...m.webSearch,
                        citations:
                          finalReply.citations.length > 0
                            ? finalReply.citations
                            : m.webSearch.citations,
                        searching: false,
                      }
                    : undefined,
                }
              : m
          )
        )
      }
    } catch (err: unknown) {
      if (!abortedRef.current) {
        const msg = err instanceof Error ? err.message : 'An error occurred.'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: msg,
                  streaming: false,
                  error: true,
                  webSearch: m.webSearch ? { ...m.webSearch, searching: false } : undefined,
                }
              : m
          )
        )
      }
    } finally {
      setStreaming(false)
    }
  }

  async function runGroupStream(_historyBefore: ChatMessage[], userMsg: ChatMessage) {
    const apiKey = getStoredOpenRouterKey()
    if (userKeyRequired && !apiKey.trim()) return

    const activeParticipants = getActiveGroupParticipants(groupParticipants, models)
    const leadParticipant = getLeadGroupParticipant(activeParticipants)

    if (activeParticipants.length < MIN_GROUP_PARTICIPANTS || !leadParticipant) {
      pushAssistantError('Enable at least two valid models in Group 1 before starting a debate.')
      return
    }

    const assistantId = crypto.randomUUID()

    // Initialize local mutable state (used for logic; synced to React state via syncGroup)
    const group: GroupData = {
      phases: Array.from({ length: groupDebateRounds }, (_, roundIndex) => ({
        label: `Round ${roundIndex + 1}`,
        runs: activeParticipants.map((participant) => ({
          participantId: participant.id,
          modelId: participant.model.id,
          modelName: participant.model.name,
          roleLabel: participant.roleLabel,
          content: '',
          status: 'pending' as const,
        })),
      })),
      currentPhaseIndex: 0,
      currentRunLabel: '',
      synthesis: '',
      synthesisStreaming: false,
      synthesisModelName: leadParticipant.model.name,
      complete: false,
    }

    function syncGroup() {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, groupData: { ...group, phases: group.phases.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r })) })) } }
            : m
        )
      )
    }

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant' as const,
        content: '',
        streaming: true,
        isReasoningModel: false,
        groupData: { ...group },
      },
    ])
    setStreaming(true)
    abortedRef.current = false

    const userText = userMsg.content.trim()

    function buildPhaseMessages(systemPrompt: string, promptText: string): OpenRouterChatMessage[] {
      return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText },
      ]
    }

    function buildRoundSystemPrompt(
      participant: ActiveGroupParticipant,
      roundIndex: number,
      previousRuns: GroupModelRun[],
    ) {
      const roleHeader = `${GROUP_SYSTEM_PROMPT}\n\nYour role in this collaboration is: ${participant.roleLabel.toUpperCase()}\nYour approach: ${participant.roleBrief}\n\nUSER'S ORIGINAL REQUEST: ${userText}`

      if (roundIndex === 0) {
        return `${roleHeader}\n\nRound 1 instructions: Produce your best full answer from this perspective. Be concrete, rigorous, and complete.`
      }

      const priorRoundSummary = previousRuns
        .map((run) => `## ${run.modelName} (${run.roleLabel})\n${run.content}`)
        .join('\n\n---\n\n')

      return `${roleHeader}\n\nYou are now in round ${roundIndex + 1}. Here are the responses from round ${roundIndex}:\n\n${priorRoundSummary}\n\nYour task: Critique the gaps, contradictions, and weak assumptions in the room, then produce an improved answer from your assigned perspective. Explain what changed and why when it matters.`
    }

    try {
      for (const [phaseIndex, phase] of group.phases.entries()) {
        group.currentPhaseIndex = phaseIndex

        for (const run of phase.runs) {
          if (abortedRef.current) break
          group.currentRunLabel = `${run.modelName} is thinking…`
          run.status = 'thinking'
          syncGroup()

          const participant = activeParticipants.find(
            (entry) => entry.id === run.participantId,
          )

          if (!participant) {
            run.content = 'Error: This configured model is no longer available.'
            run.status = 'done'
            syncGroup()
            continue
          }

          const previousRuns = phaseIndex > 0 ? group.phases[phaseIndex - 1].runs : []
          const sysPrompt = buildRoundSystemPrompt(participant, phaseIndex, previousRuns)
          const msgs = buildPhaseMessages(sysPrompt, userText)
          const startMs = Date.now()

          try {
            await createOpenRouterChatCompletionStream({
              apiKey,
              model: participant.model.id,
              messages: msgs,
              includeReasoning: participant.useReasoning,
              maxTokens: participant.maxTokens,
              reasoning: participant.useReasoning
                ? { effort: groupReasoningEffort }
                : undefined,
              plugins: webSearchEnabled ? [{ id: 'web' }] : undefined,
              webSearchOptions: webSearchEnabled ? { search_context_size: 'high' } : undefined,
              onProgress: (reply) => {
                if (abortedRef.current) return
                run.content = reply.text
                run.reasoning = reply.reasoning || run.reasoning
                syncGroup()
              },
            })
          } catch (e) {
            run.content = `Error: ${e instanceof Error ? e.message : 'Failed'}`
          }
          run.status = 'done'
          run.thinkingMs = Date.now() - startMs
          syncGroup()
        }

        if (abortedRef.current) {
          break
        }
      }

      // ── Final synthesis (lead model) ────────────────────────────
      if (!abortedRef.current) {
        group.currentPhaseIndex = group.phases.length
        group.currentRunLabel = `${leadParticipant.model.name} is synthesizing…`
        group.synthesisStreaming = true
        syncGroup()

        const phaseSummaries = group.phases
          .map(
            (phase) =>
              `# ${phase.label}\n\n${phase.runs
                .map((run) => `## ${run.modelName} (${run.roleLabel})\n${run.content}`)
                .join('\n\n---\n\n')}`,
          )
          .join('\n\n---\n\n')

        const synthesisSystem = `${GROUP_SYSTEM_PROMPT}\n\nYou are the lead synthesizer for a collaborative ${groupDebateRounds}-round problem-solving session.\nYour role in the room is: ${leadParticipant.roleLabel}\nYour approach is: ${leadParticipant.roleBrief}\n\nUSER'S ORIGINAL REQUEST: ${userText}\n\n${phaseSummaries}\n\n---\n\nYour task: Synthesize the best final answer. Take the strongest elements from the room, resolve contradictions, and produce a single comprehensive response to the user's original request. Make clear decisions where the room disagreed.`

        const msgs: OpenRouterChatMessage[] = [
          { role: 'system', content: synthesisSystem },
          { role: 'user', content: 'Please provide the final synthesized answer.' },
        ]

        try {
          await createOpenRouterChatCompletionStream({
            apiKey,
            model: leadParticipant.model.id,
            messages: msgs,
            includeReasoning: leadParticipant.useReasoning,
            maxTokens: leadParticipant.maxTokens,
            reasoning: leadParticipant.useReasoning
              ? { effort: groupReasoningEffort }
              : undefined,
            onProgress: (reply) => {
              if (abortedRef.current) return
              group.synthesis = reply.text
              syncGroup()
            },
          })
        } catch (e) {
          group.synthesis = `Error during synthesis: ${e instanceof Error ? e.message : 'Failed'}`
        }
        group.synthesisStreaming = false
      }

      group.complete = true
      group.currentRunLabel = ''
      syncGroup()

      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: group.synthesis,
                  streaming: false,
                  groupData: { ...group, phases: group.phases.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r })) })) },
                }
              : m
          )
        )
      }
    } catch (err) {
      if (!abortedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: String(err), streaming: false, error: true }
              : m
          )
        )
      }
    } finally {
      setStreaming(false)
    }
  }

  async function handleSubmit() {
    const text = prompt.trim()
    if (!text && attachments.length === 0) return
    if (!selectedModel) return
    if (streaming) return

    if (!activeChatId) {
      await createChat()
    }

    if (userKeyRequired && !getStoredOpenRouterKey().trim()) {
      pushAssistantError(getMissingCredentialMessage())
      return
    }

    shouldAutoScrollRef.current = true

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }

    const historyBefore = editingId
      ? messages.slice(0, messages.findIndex((m) => m.id === editingId))
      : messages

    setMessages([...historyBefore, userMsg])
    setPrompt('')
    setAttachments([])
    setEditingId(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    if (selectedModel?.id === GROUP_ONE_ID) {
      if (activeGroupParticipants.length < MIN_GROUP_PARTICIPANTS) {
        pushAssistantError('Enable at least two models in Group 1 before starting a debate.')
        return
      }

      if (missingGroupModels.length > 0) {
        pushAssistantError('One or more Group 1 participants use a model that is not available in the current catalog.')
        return
      }

      if (new Set(activeGroupParticipants.map((participant) => participant.model.id)).size !== activeGroupParticipants.length) {
        pushAssistantError('Choose a different model for each active Group 1 participant.')
        return
      }

      await runGroupStream(historyBefore, userMsg)
    } else {
      await runStream(historyBefore, userMsg)
    }
  }

  function startEdit(msg: ChatMessage) {
    setEditingId(msg.id)
    setPrompt(msg.content)
    setTimeout(() => {
      textareaRef.current?.focus()
      autoResize()
    }, 0)
  }

  function stopStream() {
    abortedRef.current = true
    setStreaming(false)
    // Finalize the assistant message and find the last user message in one pass
    let lastUserMsg: ChatMessage | undefined
    setMessages((prev) => {
      lastUserMsg = [...prev].reverse().find((m) => m.role === 'user')
      return prev.map((m) => {
        if (m.role !== 'assistant' || !m.streaming) return m
        return {
          ...m,
          streaming: false,
          stoppedThinking: !m.content && m.isReasoningModel,
          thinkingDuration: m.thinkingDuration ?? (m.thinkingStart ? Date.now() - m.thinkingStart : undefined),
          webSearch: m.webSearch ? { ...m.webSearch, searching: false } : undefined,
        }
      })
    })
    // Auto-open the last user message for editing
    if (lastUserMsg) setTimeout(() => startEdit(lastUserMsg!), 0)
  }

  function copyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  function toggleThinking(id: string) {
    setActiveThinkingMessageId((current) => (current === id ? null : id))
  }

  const supportsFiles = selectedModel ? (selectedModel.id !== GROUP_ONE_ID && isMultimodal(selectedModel)) : false
  const hasMessages = messages.length > 0
  const reasoningStyle = selectedModel ? getReasoningStyle(selectedModel) : 'none'
  const selectedWebSearchProfile = getWebSearchModelProfile(selectedModel)
  const supportsWebSearch = selectedWebSearchProfile.supported
  const activeGroupParticipants = getActiveGroupParticipants(groupParticipants, models)
  const groupLeadParticipant = getLeadGroupParticipant(activeGroupParticipants)
  const groupSummary = getGroupModelSummary(groupParticipants, models)
  const groupReasoningLabel = getReasoningEffortLabel(groupReasoningEffort)
  const missingGroupModels = groupParticipants.filter(
    (participant) =>
      participant.enabled && !findOpenRouterModelById(models, participant.modelId),
  )
  const activeThinkingMessage =
    activeThinkingMessageId == null
      ? null
      : messages.find(
          (message) =>
            message.id === activeThinkingMessageId &&
            message.role === 'assistant' &&
            message.isReasoningModel,
        ) ?? null
  const activeThinkingIndicator = activeThinkingMessage
    ? getThinkingIndicator(activeThinkingMessage)
    : null
  const activeThinkingTrace = activeThinkingMessage
    ? normalizeReasoningText(activeThinkingMessage.reasoning ?? '')
    : ''

  const filteredModels = modelSearch.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase()))
    : models

  const groupedModels = [
    {
      key: 'free',
      label: 'Web search included',
      models: filteredModels.filter(
        (model) => getWebSearchModelProfile(model).category === 'free',
      ),
    },
    {
      key: 'metered',
      label: 'Web search available',
      models: filteredModels.filter(
        (model) => getWebSearchModelProfile(model).category === 'metered',
      ),
    },
    {
      key: 'unsupported',
      label: 'No OpenRouter web search',
      models: filteredModels.filter(
        (model) => getWebSearchModelProfile(model).category === 'unsupported',
      ),
    },
  ].filter((group) => group.models.length > 0)

  let statsEntry: OpenRouterModelStatsEntry | null = null
  if (statsSnapshot && infoModel) statsEntry = resolveOpenRouterModelStats(statsSnapshot, infoModel)
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null

  return (
    <>
      {/* Model info side panel */}
      {infoModel && (
        <div className="model-info-overlay" onPointerDown={() => setInfoModel(null)}>
          <aside className="model-info-panel" onPointerDown={(e) => e.stopPropagation()}>
            <div className="model-info-header">
              <div>
                <p className="model-info-eyebrow">Model info</p>
                <h3 className="model-info-title">{infoModel.name}</h3>
                <p className="model-info-id">{infoModel.id}</p>
              </div>
              <button className="model-info-close" type="button" onClick={() => setInfoModel(null)}>
                <X size={18} />
              </button>
            </div>

            {infoModel.description && (
              <p className="model-info-description">{infoModel.description}</p>
            )}

            <div className="model-info-meta">
              {infoModel.context_length && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Context</span>
                  <strong>{infoModel.context_length.toLocaleString()} tokens</strong>
                </span>
              )}
              {infoModel.architecture?.input_modalities && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Inputs</span>
                  <strong>{infoModel.architecture.input_modalities.join(', ')}</strong>
                </span>
              )}
              {infoModel.pricing?.prompt && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Input</span>
                  <strong>${(Number(infoModel.pricing.prompt) * 1_000_000).toFixed(2)}/M</strong>
                </span>
              )}
              {infoModel.pricing?.completion && (
                <span className="model-info-stat">
                  <span className="model-info-stat-label">Output</span>
                  <strong>${(Number(infoModel.pricing.completion) * 1_000_000).toFixed(2)}/M</strong>
                </span>
              )}
            </div>

            <div className="model-info-stats">
              <ModelStatsPanel
                modelName={infoModel.name}
                statsEntry={statsEntry}
                statsError={statsError}
                statsLoading={statsLoading}
              />
            </div>
          </aside>
        </div>
      )}

      <div className={`prompt-page prompt-page-chat${activeThinkingMessage ? ' prompt-page-chat-thinking-open' : ''}`}>
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <strong>Chats</strong>
            <button
              className="chat-sidebar-new"
              type="button"
              onClick={() => {
                void createChat()
              }}
              disabled={streaming}
            >
              New
            </button>
          </div>

          {chatSyncError ? <p className="chat-sidebar-note">{chatSyncError}</p> : null}

          <div className="chat-sidebar-list">
            {!chatListReady ? (
              <p className="chat-sidebar-note">Loading chats…</p>
            ) : chats.length === 0 ? (
              <p className="chat-sidebar-note">No saved chats yet.</p>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  className={`chat-sidebar-item${chat.id === activeChatId ? ' chat-sidebar-item-active' : ''}`}
                  type="button"
                  onClick={() => openChat(chat.id)}
                  disabled={streaming}
                >
                  <span className="chat-sidebar-item-title">{chat.title}</span>
                  <span className="chat-sidebar-item-meta">
                    {chat.modelName ?? 'No model'}
                    {chat.updatedAt ? ` · ${formatChatTime(chat.updatedAt)}` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="prompt-chat-shell">
          <div className="chat-main-header">
            <strong>{activeChat?.title ?? 'New chat'}</strong>
          </div>
          {/* Chat history */}
          {hasMessages && (
            <div className="chat-container" ref={chatContainerRef}>
              {messages.map((msg) => {
                const hasReasoningTrace = Boolean(msg.reasoning?.trim())
                const isThinkingExpanded = hasReasoningTrace && activeThinkingMessageId === msg.id
                const thinkingIndicator = getThinkingIndicator(msg)
                const thinkingIndicatorClassName =
                  thinkingIndicator.tone === 'pulse'
                    ? 'chat-thinking-pulse'
                    : thinkingIndicator.tone === 'stopped'
                      ? 'chat-thinking-stopped'
                      : undefined

                return (
              <div key={msg.id} className={`chat-row chat-row-${msg.role}`}>
                <div className={`chat-bubble chat-bubble-${msg.role}${msg.error ? ' chat-bubble-error' : ''}`}>
                  {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                    <div className="chat-attachments">
                      {msg.attachments.map((a) => (
                        <div key={a.id} className="chat-attachment-pill">
                          {a.mimeType.startsWith('image/') ? (
                            <img src={a.dataUrl} alt={a.name} className="chat-attachment-thumb" />
                          ) : (
                            <Paperclip size={11} />
                          )}
                          <span>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div className="chat-markdown">
                      {msg.groupData ? (
                        /* ── Group 1 collaborative message ── */
                        <>
                          {/* Live thinking indicator */}
                          {msg.streaming && msg.groupData.currentRunLabel && (
                            <div className="chat-thinking-row">
                              <span className="chat-thinking-pulse">{msg.groupData.currentRunLabel}</span>
                              <span className="group-phase-indicator">
                                {msg.groupData.currentPhaseIndex < msg.groupData.phases.length
                                  ? `Round ${msg.groupData.currentPhaseIndex + 1}/${msg.groupData.phases.length}`
                                  : 'Synthesis'}
                              </span>
                            </div>
                          )}

                          {/* Phase outputs — collapsible */}
                          {msg.groupData.phases.map((phase, pi) => {
                            const activeRuns = phase.runs.filter((r) => r.status !== 'pending')
                            if (activeRuns.length === 0) return null
                            return (
                              <details key={pi} className="group-phase-details">
                                <summary className="group-phase-summary">
                                  <span className="group-phase-label">{phase.label}</span>
                                  <span className="group-phase-meta">{activeRuns.filter(r => r.status === 'done').length}/{phase.runs.length} models</span>
                                </summary>
                                <div className="group-phase-runs">
                                  {activeRuns.map((run) => (
                                    <div key={run.modelId} className={`group-run group-run-${run.status}`}>
                                      <div className="group-run-header">
                                        <span className="group-run-model">{run.modelName}</span>
                                        <span className="group-run-role">{run.roleLabel}</span>
                                        {run.status === 'thinking' && <span className="chat-thinking-pulse group-run-thinking">thinking…</span>}
                                        {run.thinkingMs != null && <span className="group-run-time">Thought for {Math.round(run.thinkingMs / 1000)}s</span>}
                                      </div>
                                      {run.content && <MarkdownBlock>{run.content}</MarkdownBlock>}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )
                          })}

                          {/* Synthesis */}
                          {(msg.groupData.synthesisStreaming || msg.groupData.synthesis) && (
                            <div className="group-synthesis">
                              <div className="group-synthesis-header">
                                <span>✦ Final Answer</span>
                                {msg.groupData.synthesisStreaming && <span className="chat-thinking-pulse">{msg.groupData.synthesisModelName} synthesizing…</span>}
                              </div>
                              <MarkdownBlock>{msg.groupData.synthesis}</MarkdownBlock>
                            </div>
                          )}
                        </>
                      ) : (
                        /* ── Normal single-model message ── */
                        <>
                          {/* thinking / reasoning block — shown for reasoning models only */}
                          {msg.isReasoningModel && (
                            <div className="chat-thinking-row">
                              <button
                                className={`chat-thinking-toggle${hasReasoningTrace ? '' : ' chat-thinking-toggle-disabled'}${isThinkingExpanded ? ' chat-thinking-toggle-active' : ''}`}
                                type="button"
                                disabled={!hasReasoningTrace}
                                aria-expanded={isThinkingExpanded}
                                aria-controls={hasReasoningTrace ? 'chat-thinking-panel' : undefined}
                                onClick={() => toggleThinking(msg.id)}
                              >
                                <span className={thinkingIndicatorClassName}>{thinkingIndicator.label}</span>
                              </button>
                            </div>
                          )}
                          <MarkdownBlock>{msg.content}</MarkdownBlock>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="chat-user-text">{msg.content}</p>
                  )}
                </div>

                <div className={`chat-actions chat-actions-${msg.role}`}>
                  <button
                    className={`chat-action-btn${copiedId === msg.id ? ' chat-action-btn-done' : ''}`}
                    type="button"
                    onClick={() => copyMessage(msg.id, msg.content)}
                    aria-label="Copy"
                    title="Copy"
                  >
                    {copiedId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  {msg.role === 'user' && !streaming && (
                    <button
                      className="chat-action-btn"
                      type="button"
                      onClick={() => startEdit(msg)}
                      aria-label="Edit"
                      title="Edit & resend"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </div>
                )
              })}
            </div>
          )}

        {/* Input area */}
        <div className={`prompt-center${hasMessages ? ' prompt-center-sticky' : ''}`}>
          <div className="prompt-box">
            {attachments.length > 0 && (
              <div className="prompt-attachments">
                {attachments.map((a) => (
                  <div key={a.id} className="prompt-attachment-pill">
                    {a.mimeType.startsWith('image/') ? (
                      <img src={a.dataUrl} alt={a.name} className="prompt-attachment-thumb" />
                    ) : (
                      <Paperclip size={12} />
                    )}
                    <span>{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.id)} aria-label="Remove">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="prompt-textarea"
              placeholder={editingId ? 'Edit your message…' : 'Ask anything…'}
              value={prompt}
              rows={1}
              onChange={(e) => { setPrompt(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />

            <div className="prompt-actions">
              <div className="prompt-actions-left">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.md,.csv"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  className={`prompt-pill-btn${!supportsFiles ? ' prompt-pill-btn-disabled' : ''}`}
                  type="button"
                  disabled={!supportsFiles}
                  onClick={() => supportsFiles && fileInputRef.current?.click()}
                  title={supportsFiles ? 'Attach file' : 'Select a multimodal model to attach files'}
                >
                  <Paperclip size={15} />
                  <span>Attach</span>
                </button>

                <div className="model-selector" ref={modelDropRef}>
                  <button
                    className="model-selector-trigger"
                    type="button"
                    onClick={() => setModelOpen((o) => !o)}
                  >
                    <span className="model-selector-name">
                      {selectedModel ? selectedModel.name : 'Search models'}
                    </span>
                    <ChevronDown size={13} className={`model-selector-chevron${modelOpen ? ' model-selector-chevron-open' : ''}`} />
                  </button>

                  {modelOpen && (
                    <div className="model-dropdown">
                      <div className="model-search-wrap">
                        <Search size={13} className="model-search-icon" />
                        <input
                          ref={modelSearchRef}
                          className="model-search-input"
                          placeholder="Search models…"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          spellCheck={false}
                        />
                      </div>
                      <div className="model-list">
                        {/* Group 1 — pinned at top */}
                        {(!modelSearch.trim() || 'group 1'.includes(modelSearch.toLowerCase()) || 'group1'.includes(modelSearch.toLowerCase())) && (
                          <div className="model-list-group">
                            <p className="model-list-group-label">Collaboration</p>
                            <div className={`model-list-item${selectedModel?.id === GROUP_ONE_ID ? ' model-list-item-active' : ''}`}>
                              <button
                                className="model-list-select"
                                type="button"
                                onClick={() => {
                                  setSelectedModel(GROUP_ONE)
                                  setModelOpen(false)
                                  setModelSearch('')
                                  setAttachments([])
                                }}
                              >
                                <span className="model-list-name">Group 1</span>
                                <span className="model-list-id">{groupSummary}</span>
                                <div className="model-list-badges">
                                  <span className="model-list-badge model-list-badge-free">Free web search</span>
                                  <span className="model-list-badge model-list-badge-group">
                                    {activeGroupParticipants.length} models
                                  </span>
                                </div>
                              </button>
                            </div>
                          </div>
                        )}
                        {modelCatalogNotice && !modelSearch.trim() && (
                          <p className="model-list-status">{modelCatalogNotice}</p>
                        )}
                        {filteredModels.length === 0 && (
                          <p className="model-list-empty">
                            {modelSearch.trim()
                              ? 'No models match your search'
                              : 'No models found'}
                          </p>
                        )}
                        {groupedModels.map((group) => (
                          <div key={group.key} className="model-list-group">
                            <p className="model-list-group-label">{group.label}</p>
                            {group.models.map((m) => {
                              const webSearchProfile = getWebSearchModelProfile(m)

                              return (
                                <div
                                  key={m.id}
                                  className={`model-list-item${selectedModel?.id === m.id ? ' model-list-item-active' : ''}`}
                                >
                                  <button
                                    className="model-list-select"
                                    type="button"
                                    onClick={() => {
                                      setSelectedModel(m)
                                      setModelOpen(false)
                                      setModelSearch('')
                                      if (!isMultimodal(m)) setAttachments([])
                                    }}
                                  >
                                    <span className="model-list-name">{m.name}</span>
                                    <span className="model-list-id">{m.id}</span>
                                    <div className="model-list-badges">
                                      {webSearchProfile.supported && (
                                        <span className={`model-list-badge${webSearchProfile.category === 'free' ? ' model-list-badge-free' : ' model-list-badge-metered'}`}>
                                          {webSearchProfile.priceLabel}
                                        </span>
                                      )}
                                      <span className="model-list-badge model-list-badge-provider">
                                        {webSearchProfile.providerLabel}
                                      </span>
                                    </div>
                                  </button>
                                  <button
                                    className="model-list-info-btn"
                                    type="button"
                                    onClick={(e) => openInfoPanel(e, m)}
                                    aria-label={`Info for ${m.name}`}
                                  >
                                    <Info size={13} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reasoning effort selector — styled like model selector pill */}
                {selectedModel?.id !== GROUP_ONE_ID && (reasoningStyle === 'effort' || reasoningStyle === 'include') && (
                  <div className="model-selector effort-selector" ref={effortDropRef}>
                    <button
                      className="model-selector-trigger"
                      type="button"
                      onClick={() => reasoningStyle === 'effort' && setEffortOpen((o) => !o)}
                      title="Reasoning depth"
                    >
                      <span className="model-selector-name">
                        {reasoningStyle === 'include'
                          ? 'Thinking'
                          : (EFFORT_LEVELS.find((e) => e.value === reasoningEffort)?.label ?? 'Thinking')}
                      </span>
                      {reasoningStyle === 'effort' && (
                        <ChevronDown size={13} className={`model-selector-chevron${effortOpen ? ' model-selector-chevron-open' : ''}`} />
                      )}
                    </button>

                    {effortOpen && reasoningStyle === 'effort' && (
                      <div className="effort-dropdown">
                        {EFFORT_LEVELS.map((level) => (
                          <div
                            key={level.value}
                            className={`effort-option${reasoningEffort === level.value ? ' effort-option-active' : ''}`}
                          >
                            <button
                              type="button"
                              className="effort-option-select"
                              onClick={() => { setReasoningEffort(level.value); setEffortOpen(false) }}
                            >
                              <span className="effort-option-label">{level.label}</span>
                            </button>
                            <button
                              type="button"
                              className="effort-option-info"
                              onClick={(e) => { e.stopPropagation() }}
                            >
                              <Info size={13} />
                              <span className="effort-tooltip">{level.desc}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(supportsWebSearch || selectedModel?.id === GROUP_ONE_ID) && (
                  <button
                    className={`prompt-pill-btn${webSearchEnabled ? ' prompt-pill-btn-active' : ''}`}
                    type="button"
                    onClick={() => setWebSearchEnabled((value) => !value)}
                    title={selectedWebSearchProfile.priceLabel}
                  >
                    <Search size={15} />
                    <span>{webSearchEnabled ? 'Web on' : 'Web off'}</span>
                  </button>
                )}
                {selectedModel?.id === GROUP_ONE_ID && (
                  <div className="group-disclaimer">
                    <span>{groupSummary}</span>
                    <span className="group-disclaimer-separator">•</span>
                    <span>{groupDebateRounds} {groupDebateRounds === 1 ? 'round' : 'rounds'}</span>
                    <span className="group-disclaimer-separator">•</span>
                    <span>{groupReasoningLabel} reasoning</span>
                  </div>
                )}
              </div>

              <div className="prompt-actions-right">
                <button
                  className={`prompt-mic${listening ? ' prompt-mic-active' : ''}`}
                  type="button"
                  onClick={toggleVoice}
                  aria-label={listening ? 'Stop recording' : 'Start voice input'}
                >
                  <Mic size={18} />
                </button>
                <button
                  className={`prompt-submit${streaming ? ' prompt-submit-active' : (prompt.trim() || attachments.length > 0) ? ' prompt-submit-active' : ''}`}
                  type="button"
                  disabled={!streaming && !prompt.trim() && attachments.length === 0}
                  onClick={streaming ? stopStream : handleSubmit}
                  aria-label={streaming ? 'Stop' : 'Submit'}
                >
                  {streaming ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}
                </button>
              </div>
            </div>

            {selectedModel?.id === GROUP_ONE_ID && (
              <div className="group-config-panel">
                <button
                  className="group-config-summary"
                  type="button"
                  onClick={() => setGroupCustomizationOpen((open) => !open)}
                  aria-expanded={groupCustomizationOpen}
                >
                  <span className="group-config-summary-copy">
                    <span className="group-config-summary-title">Customize Group 1</span>
                    <span className="group-config-summary-meta">
                      {activeGroupParticipants.length} models · {groupDebateRounds} {groupDebateRounds === 1 ? 'round' : 'rounds'} · {groupReasoningLabel} reasoning
                    </span>
                  </span>
                  <ChevronDown size={14} className={`model-selector-chevron${groupCustomizationOpen ? ' model-selector-chevron-open' : ''}`} />
                </button>

                {groupCustomizationOpen && (
                  <div className="group-config-content">
                    <div className="group-config-grid">
                      <label className="group-config-field">
                        <span>Debate rounds</span>
                        <input
                          className="group-config-input"
                          type="number"
                          min={MIN_GROUP_DEBATE_ROUNDS}
                          max={MAX_GROUP_DEBATE_ROUNDS}
                          value={groupDebateRounds}
                          onChange={(e) =>
                            setGroupDebateRounds(
                              clampWholeNumber(
                                Number(e.target.value),
                                MIN_GROUP_DEBATE_ROUNDS,
                                MAX_GROUP_DEBATE_ROUNDS,
                              ),
                            )
                          }
                        />
                      </label>

                      <label className="group-config-field">
                        <span>Reasoning depth</span>
                        <select
                          className="group-config-input"
                          value={groupReasoningEffort}
                          onChange={(e) =>
                            setGroupReasoningEffort(
                              e.target.value as OpenRouterReasoningEffort,
                            )
                          }
                        >
                          {EFFORT_LEVELS.map((level) => (
                            <option key={level.value} value={level.value}>
                              {level.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <p className="group-config-note">
                      Choose the debating models, set response budgets, and assign specialized roles. The lead model writes the final synthesis.
                    </p>

                    {missingGroupModels.length > 0 && (
                      <p className="group-config-warning">
                        One or more configured models are not in the current catalog snapshot. Pick another model before running.
                      </p>
                    )}

                    <div className="group-config-participants">
                      {groupParticipants.map((participant, index) => {
                        const currentModel = findOpenRouterModelById(
                          models,
                          participant.modelId,
                        )

                        return (
                          <article
                            key={participant.id}
                            className={`group-config-card${participant.enabled ? ' group-config-card-active' : ''}`}
                          >
                            <div className="group-config-card-header">
                              <div>
                                <p className="group-config-card-label">
                                  Participant {index + 1}
                                </p>
                                <h4>{currentModel?.name ?? participant.modelId}</h4>
                              </div>
                              <div className="group-config-card-controls">
                                <label className="group-config-check">
                                  <input
                                    type="checkbox"
                                    checked={participant.enabled}
                                    onChange={(e) =>
                                      updateGroupParticipant(participant.id, (current) => ({
                                        ...current,
                                        enabled: e.target.checked,
                                      }))
                                    }
                                  />
                                  <span>Enabled</span>
                                </label>
                                <label className="group-config-check">
                                  <input
                                    type="radio"
                                    name="group-lead"
                                    checked={participant.enabled && participant.lead}
                                    disabled={!participant.enabled}
                                    onChange={() => setGroupLead(participant.id)}
                                  />
                                  <span>Lead synth</span>
                                </label>
                              </div>
                            </div>

                            <div className="group-config-card-grid">
                              <label className="group-config-field group-config-field-full">
                                <span>Model</span>
                                <select
                                  className="group-config-input"
                                  value={participant.modelId}
                                  onChange={(e) =>
                                    updateGroupParticipant(participant.id, (current) => ({
                                      ...current,
                                      modelId: e.target.value,
                                    }))
                                  }
                                >
                                  {models.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name} ({model.id})
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="group-config-field">
                                <span>Role</span>
                                <input
                                  className="group-config-input"
                                  type="text"
                                  value={participant.roleLabel}
                                  onChange={(e) =>
                                    updateGroupParticipant(participant.id, (current) => ({
                                      ...current,
                                      roleLabel: e.target.value,
                                    }))
                                  }
                                  placeholder="Builder"
                                />
                              </label>

                              <label className="group-config-field">
                                <span>Token budget</span>
                                <input
                                  className="group-config-input"
                                  type="number"
                                  min={MIN_GROUP_MAX_TOKENS}
                                  max={MAX_GROUP_MAX_TOKENS}
                                  value={participant.maxTokens}
                                  onChange={(e) =>
                                    updateGroupParticipant(participant.id, (current) => ({
                                      ...current,
                                      maxTokens: clampWholeNumber(
                                        Number(e.target.value),
                                        MIN_GROUP_MAX_TOKENS,
                                        MAX_GROUP_MAX_TOKENS,
                                      ),
                                    }))
                                  }
                                />
                              </label>

                              <label className="group-config-field group-config-field-full">
                                <span>Approach</span>
                                <textarea
                                  className="group-config-input group-config-textarea"
                                  rows={3}
                                  value={participant.roleBrief}
                                  onChange={(e) =>
                                    updateGroupParticipant(participant.id, (current) => ({
                                      ...current,
                                      roleBrief: e.target.value,
                                    }))
                                  }
                                  placeholder="Focus this model on a specific style of thinking."
                                />
                              </label>
                            </div>

                            <label className="group-config-check group-config-check-inline">
                              <input
                                type="checkbox"
                                checked={participant.useReasoning}
                                onChange={(e) =>
                                  updateGroupParticipant(participant.id, (current) => ({
                                    ...current,
                                    useReasoning: e.target.checked,
                                  }))
                                }
                              />
                              <span>Use provider reasoning for this participant</span>
                            </label>
                          </article>
                        )
                      })}
                    </div>

                    {groupLeadParticipant && (
                      <p className="group-config-footnote">
                        Final synthesis lead: {groupLeadParticipant.model.name} as {groupLeadParticipant.roleLabel}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {editingId && (
            <p className="prompt-edit-notice">
              Editing — submit to replace &amp; resend
              <button
                type="button"
                className="prompt-edit-cancel"
                onClick={() => { setEditingId(null); setPrompt('') }}
              >
                Cancel
              </button>
            </p>
          )}
        </div>
        </div>

        {activeThinkingMessage && activeThinkingIndicator && (
          <>
            <button
              className="chat-thinking-backdrop"
              type="button"
              aria-label="Close thinking panel"
              onClick={() => setActiveThinkingMessageId(null)}
            />
            <aside
              id="chat-thinking-panel"
              className="chat-thinking-panel"
              aria-labelledby="chat-thinking-panel-title"
            >
              <div className="chat-thinking-panel-inner">
                <div className="chat-thinking-panel-header">
                  <h2 id="chat-thinking-panel-title" className="chat-thinking-panel-title">
                    {activeThinkingIndicator.label}
                  </h2>
                  <button
                    className="chat-thinking-panel-close"
                    type="button"
                    aria-label="Close thinking panel"
                    onClick={() => setActiveThinkingMessageId(null)}
                  >
                    <X size={14} />
                  </button>
                </div>

                {activeThinkingMessage.content.trim() && (
                  <div className="chat-thinking-panel-preview">
                    <p>{activeThinkingMessage.content.trim()}</p>
                  </div>
                )}

                <div className="chat-thinking-panel-body">
                  {activeThinkingTrace ? (
                    <div className="chat-thinking-panel-content">
                      <MarkdownBlock>{activeThinkingTrace}</MarkdownBlock>
                    </div>
                  ) : (
                    <p className="chat-thinking-empty">This response did not return a visible reasoning trace.</p>
                  )}
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </>
  )
}
