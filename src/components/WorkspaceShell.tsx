import { useState } from 'react'
import type { User } from 'firebase/auth'
import { FileText, MessageSquare, Swords } from 'lucide-react'
import { DebateWorkspace } from './DebateWorkspace'
import { ChatWorkspace } from './ChatWorkspace'
import { LatexWorkspacePanel } from './LatexWorkspacePanel'

type WorkspaceId = 'debate' | 'chat' | 'latex'

interface WorkspaceShellProps {
  currentUser: User | null
}

const WORKSPACE_TABS: { id: WorkspaceId; icon: typeof Swords; label: string }[] = [
  { id: 'debate', icon: Swords, label: 'Debate' },
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'latex', icon: FileText, label: 'LaTeX' },
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

  return (
    <div className="workspace-shell-layout">
      <nav className="workspace-sidebar-rail" aria-label="Workspace navigation">
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeWorkspace === tab.id

          return (
            <button
              key={tab.id}
              className={`workspace-rail-btn${isActive ? ' workspace-rail-btn-active' : ''}`}
              type="button"
              onClick={() => setActiveWorkspace(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} />
              <span className="workspace-rail-label">{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="workspace-content-area">
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
