import { useState } from 'react'
import type { User } from 'firebase/auth'
import { DebateWorkspace } from './DebateWorkspace'
import { ChatWorkspace } from './ChatWorkspace'
import { LatexWorkspacePanel } from './LatexWorkspacePanel'

type WorkspaceId = 'debate' | 'chat' | 'latex'

interface WorkspaceShellProps {
  currentUser: User | null
}

const WORKSPACE_TABS: { id: WorkspaceId; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'debate', label: 'Debate' },
  { id: 'latex', label: 'LaTeX' },
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
      <nav className="workspace-tab-bar" aria-label="Workspace navigation">
        {WORKSPACE_TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`workspace-tab-btn${activeWorkspace === id ? ' workspace-tab-btn-active' : ''}`}
            type="button"
            onClick={() => setActiveWorkspace(id)}
            aria-current={activeWorkspace === id ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
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
