import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { User } from 'firebase/auth'
import { DebateWorkspace } from './DebateWorkspace'
import { ChatWorkspace } from './ChatWorkspace'
import { LatexWorkspacePanel } from './LatexWorkspacePanel'

type WorkspaceId = 'debate' | 'chat' | 'latex'

interface WorkspaceShellProps {
  currentUser: User | null
}

const WORKSPACE_TABS: { id: WorkspaceId; label: string }[] = [
  { id: 'debate', label: 'Debate' },
  { id: 'chat', label: 'Chat' },
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
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} strokeWidth={1.6} /> : <PanelLeftClose size={15} strokeWidth={1.6} />}
          </button>
        </div>

        <div className="workspace-sidebar-nav">
          {WORKSPACE_TABS.map((tab) => {
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
                {!sidebarCollapsed && <span className="workspace-rail-label">{tab.label}</span>}
              </button>
            )
          })}
        </div>
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
