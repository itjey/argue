import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

type StoredAttachment = {
  id: string
  name: string
  mimeType: string
}

type StoredChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: StoredAttachment[]
  error?: boolean
  reasoning?: string
  isReasoningModel?: boolean
  thinkingDuration?: number
  stoppedThinking?: boolean
  webSearch?: {
    enabled: boolean
    approximateQuery: string
    citations: { url: string; title?: string }[]
    searching: boolean
  }
  isDebate?: boolean
  debateRounds?: unknown[]
  debateSynthesis?: string
  debateComplete?: boolean
  debateCurrentLabel?: string
  debateRoundMetrics?: unknown[]
}

type SavedChat = {
  id: string
  workspace: 'chat' | 'debate'
  title: string
  modelId: string | null
  messages: StoredChatMessage[]
  createdAt: unknown
  updatedAt: unknown
}

function chatCollection(userId: string) {
  return collection(db, 'users', userId, 'chats')
}

function deriveTitle(messages: StoredChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first || !first.content.trim()) return 'New chat'
  const text = first.content.trim()
  if (text.length <= 60) return text
  const truncated = text.slice(0, 60)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '…'
}

function sanitizeMessagesForStorage(messages: { id: string; role: string; content: string; [key: string]: unknown }[]): StoredChatMessage[] {
  return messages
    .filter((m) => !m.error)
    .filter((m) => !m.streaming)
    .map((m) => {
      const stored: StoredChatMessage = {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }

      if (m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0) {
        stored.attachments = (m.attachments as { id: string; name: string; mimeType: string }[]).map((a) => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
        }))
      }

      if (m.reasoning) stored.reasoning = m.reasoning as string
      if (m.isReasoningModel) stored.isReasoningModel = true
      if (m.thinkingDuration) stored.thinkingDuration = m.thinkingDuration as number
      if (m.stoppedThinking) stored.stoppedThinking = true

      if (m.webSearch && typeof m.webSearch === 'object') {
        const ws = m.webSearch as { enabled: boolean; approximateQuery: string; citations: { url: string; title?: string }[] }
        stored.webSearch = {
          enabled: ws.enabled,
          approximateQuery: ws.approximateQuery,
          citations: ws.citations ?? [],
          searching: false,
        }
      }

      if (m.isDebate) stored.isDebate = true
      if (m.debateRounds) stored.debateRounds = m.debateRounds as unknown[]
      if (m.debateSynthesis) stored.debateSynthesis = m.debateSynthesis as string
      if (m.debateComplete) stored.debateComplete = true
      if (m.debateCurrentLabel) stored.debateCurrentLabel = m.debateCurrentLabel as string
      if (m.debateRoundMetrics) stored.debateRoundMetrics = m.debateRoundMetrics as unknown[]

      return stored
    })
}

async function saveChat(
  userId: string,
  chat: { id?: string; workspace: 'chat' | 'debate'; modelId: string | null; messages: StoredChatMessage[] },
): Promise<string> {
  const chatId = chat.id ?? crypto.randomUUID()
  const ref = doc(db, 'users', userId, 'chats', chatId)

  await setDoc(ref, {
    workspace: chat.workspace,
    title: deriveTitle(chat.messages),
    modelId: chat.modelId,
    messages: JSON.parse(JSON.stringify(chat.messages)),
    createdAt: chat.id ? undefined : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return chatId
}

async function loadChats(userId: string, workspace: 'chat' | 'debate'): Promise<SavedChat[]> {
  const q = query(
    chatCollection(userId),
    where('workspace', '==', workspace),
    orderBy('updatedAt', 'desc'),
  )
  const snapshot = await getDocs(q)

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data()
    return {
      id: docSnap.id,
      workspace: data.workspace as 'chat' | 'debate',
      title: data.title ?? 'New chat',
      modelId: data.modelId ?? null,
      messages: (data.messages ?? []) as StoredChatMessage[],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
  })
}

async function deleteChat(userId: string, chatId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'chats', chatId))
}

export {
  deleteChat,
  loadChats,
  sanitizeMessagesForStorage,
  saveChat,
}

export type { SavedChat, StoredChatMessage }
