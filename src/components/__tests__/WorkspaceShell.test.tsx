import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

// Mock child components to avoid their complex dependencies
vi.mock('../DebateWorkspace', () => ({
  DebateWorkspace: () => <div data-testid="debate-workspace">Debate</div>,
}))
vi.mock('../ChatWorkspace', () => ({
  ChatWorkspace: () => <div data-testid="chat-workspace">Chat</div>,
}))
vi.mock('../LatexWorkspacePanel', () => ({
  LatexWorkspacePanel: () => <div data-testid="latex-workspace">LaTeX</div>,
}))

// Import after mocks are set up
import { WorkspaceShell } from '../WorkspaceShell'

const mockUser = { uid: 'test-uid', email: 'test@test.com' } as never

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sidebar navigation with three buttons', () => {
    render(<WorkspaceShell currentUser={mockUser} />)
    expect(screen.getByRole('button', { name: 'Debate' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'LaTeX' })).toBeTruthy()
  })

  it('shows debate workspace by default', () => {
    render(<WorkspaceShell currentUser={mockUser} />)
    expect(screen.getByTestId('debate-workspace')).toBeTruthy()
  })

  it('switches to chat workspace on click', async () => {
    const user = userEvent.setup()
    render(<WorkspaceShell currentUser={mockUser} />)
    await user.click(screen.getByRole('button', { name: 'Chat' }))
    expect(screen.getByTestId('chat-workspace')).toBeTruthy()
  })

  it('switches to latex workspace on click', async () => {
    const user = userEvent.setup()
    render(<WorkspaceShell currentUser={mockUser} />)
    await user.click(screen.getByRole('button', { name: 'LaTeX' }))
    expect(screen.getByTestId('latex-workspace')).toBeTruthy()
  })
})
