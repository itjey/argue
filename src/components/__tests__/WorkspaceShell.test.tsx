import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

vi.mock('../DebateWorkspace', () => ({
  DebateWorkspace: () => <div data-testid="debate-workspace">Debate</div>,
}))
vi.mock('../ChatWorkspace', () => ({
  ChatWorkspace: () => <div data-testid="chat-workspace">Chat</div>,
}))
vi.mock('../LatexWorkspacePanel', () => ({
  LatexWorkspacePanel: () => <div data-testid="latex-workspace">LaTeX</div>,
}))

import { WorkspaceShell } from '../WorkspaceShell'

const mockUser = { uid: 'test-uid', email: 'test@test.com' } as never

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sidebar navigation with three buttons', () => {
    render(<WorkspaceShell currentUser={mockUser} />)
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Debate' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Write' })).toBeTruthy()
  })

  it('shows chat workspace by default', () => {
    render(<WorkspaceShell currentUser={mockUser} />)
    expect(screen.getByTestId('chat-workspace')).toBeTruthy()
  })

  it('switches to debate workspace on click', async () => {
    const user = userEvent.setup()
    render(<WorkspaceShell currentUser={mockUser} />)
    await user.click(screen.getByRole('button', { name: 'Debate' }))
    expect(screen.getByTestId('debate-workspace')).toBeTruthy()
  })

  it('switches to write workspace on click', async () => {
    const user = userEvent.setup()
    render(<WorkspaceShell currentUser={mockUser} />)
    await user.click(screen.getByRole('button', { name: 'Write' }))
    expect(screen.getByTestId('latex-workspace')).toBeTruthy()
  })
})
