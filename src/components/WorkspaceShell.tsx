import { useState } from 'react'
import type { ComponentType } from 'react'
import { ChevronLeft, ChevronRight, Swords, MessageSquare, FileText } from 'lucide-react'
import type { User } from 'firebase/auth'
import { DebateWorkspace } from './DebateWorkspace'
import { ChatWorkspace } from './ChatWorkspace'
import { LatexWorkspacePanel } from './LatexWorkspacePanel'

type WorkspaceId = 'debate' | 'chat' | 'latex'

interface WorkspaceShellProps {
  currentUser: User | null
}

const WORKSPACE_TABS: { id: WorkspaceId; label: string; Icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'debate', label: 'Debate', Icon: Swords },
  { id: 'latex', label: 'LaTeX', Icon: FileText },
]

const DEFAULT_LATEX_TEMPLATE = `\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\title{Untitled Document}
\\author{}
\\date{\\today}
\\begin{document}
\\maketitle
\\section{Introduction}
Write your content here.
\\end{document}`

function WorkspaceShell({ currentUser }: WorkspaceShellProps) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(currentUser ? 'debate' : 'chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="workspace-shell-layout">
      <nav
        className={`workspace-sidebar-rail${sidebarCollapsed ? ' workspace-sidebar-rail-collapsed' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="workspace-sidebar-header">
          <button
            className="workspace-sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronLeft size={13} strokeWidth={2} />
          </button>
        </div>

        <div className="workspace-sidebar-nav">
          {WORKSPACE_TABS.map(({ id, label, Icon }) => {
            const isActive = activeWorkspace === id

            return (
              <button
                key={id}
                className={`workspace-rail-btn${isActive ? ' workspace-rail-btn-active' : ''}`}
                type="button"
                onClick={() => setActiveWorkspace(id)}
                title={label}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={14} strokeWidth={1.7} />
                <span className="workspace-rail-label">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="workspace-content-area">
        {sidebarCollapsed && (
          <button
            className="workspace-sidebar-pull-tab"
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronRight size={12} strokeWidth={2} />
          </button>
        )}
        {activeWorkspace === 'debate' && <DebateWorkspace currentUser={currentUser} />}
        {activeWorkspace === 'chat' && <ChatWorkspace currentUser={currentUser} />}
        {activeWorkspace === 'latex' && (
          <LatexWorkspacePanel
            inline
            initialSource={DEFAULT_LATEX_TEMPLATE}
            label="LaTeX"
            onHide={() => setActiveWorkspace('debate')}
            open
          />
        )}
      </div>
    </div>
  )
}

export { WorkspaceShell }
export type { WorkspaceId }
