import { useEffect, useState } from 'react'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { loadChats, deleteChat, type SavedChat } from '../lib/chatHistory'

interface ChatSidebarProps {
  userId: string
  workspace: 'chat' | 'debate'
  activeChatId: string | null
  onSelectChat: (chat: SavedChat) => void
  onNewChat: () => void
  onCollapse?: () => void
  refreshKey: number
}

function relativeTime(timestamp: unknown): string {
  if (!timestamp || typeof timestamp !== 'object') return ''
  const ts = timestamp as { seconds?: number }
  if (!ts.seconds) return ''
  const diff = Date.now() - ts.seconds * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ChatSidebar({ userId, workspace, activeChatId, onSelectChat, onNewChat, onCollapse, refreshKey }: ChatSidebarProps) {
  const [chats, setChats] = useState<SavedChat[]>([])

  useEffect(() => {
    loadChats(userId, workspace).then(setChats).catch(() => {})
  }, [userId, workspace, refreshKey])

  function handleDelete(e: React.MouseEvent, chatId: string) {
    e.stopPropagation()
    setChats((prev) => prev.filter((c) => c.id !== chatId))
    deleteChat(userId, chatId).catch(() => {})
  }

  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar-header">
        <strong>{workspace === 'debate' ? 'Debates' : 'Chats'}</strong>
        <div className="chat-sidebar-header-actions">
          <button className="chat-sidebar-new" type="button" onClick={onNewChat} title="New chat">
            <Plus size={14} />
          </button>
          {onCollapse && (
            <button className="chat-sidebar-new" type="button" onClick={onCollapse} title="Collapse">
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-sidebar-list">
        {chats.map((chat) => (
          <button
            key={chat.id}
            className={`chat-sidebar-item${chat.id === activeChatId ? ' chat-sidebar-item-active' : ''}`}
            type="button"
            onClick={() => onSelectChat(chat)}
          >
            <span className="chat-sidebar-item-title">{chat.title}</span>
            <span className="chat-sidebar-item-meta">{relativeTime(chat.updatedAt)}</span>
            <button
              className="chat-sidebar-item-delete"
              type="button"
              onClick={(e) => handleDelete(e, chat.id)}
              title="Delete"
            >
              <X size={11} />
            </button>
          </button>
        ))}
        {chats.length === 0 && (
          <p className="chat-sidebar-note">No saved chats yet</p>
        )}
      </div>
    </aside>
  )
}

export { ChatSidebar }
