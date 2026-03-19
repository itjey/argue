import { useState } from 'react'
import type { User } from 'firebase/auth'
import { FileText, MessageSquare, PanelLeftClose, PanelLeftOpen, Scale } from 'lucide-react'
import { DebateWorkspace } from './DebateWorkspace'
import { ChatWorkspace } from './ChatWorkspace'
import { LatexWorkspacePanel } from './LatexWorkspacePanel'

type WorkspaceId = 'debate' | 'chat' | 'latex'

interface WorkspaceShellProps {
  currentUser: User | null
}

const WORKSPACE_TABS: { id: WorkspaceId; icon: typeof Scale; label: string }[] = [
  { id: 'debate', icon: Scale, label: 'Debate' },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="workspace-shell-layout">
      <nav
        className={`workspace-sidebar-rail${sidebarCollapsed ? ' workspace-sidebar-rail-collapsed' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="workspace-sidebar-header">
          <div className="workspace-sidebar-brand" aria-hidden="true">
            <span className="workspace-sidebar-brand-mark">A</span>
            {!sidebarCollapsed && <span className="workspace-sidebar-brand-text">Argue</span>}
          </div>

          <button
            className="workspace-sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className="workspace-sidebar-nav">
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
                <span className="workspace-rail-icon-wrap">
                  <Icon size={20} />
                </span>
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
