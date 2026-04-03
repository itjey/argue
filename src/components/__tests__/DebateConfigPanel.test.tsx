import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DebateConfigPanel } from '../DebateConfigPanel'
import { DEFAULT_DEBATE_CONFIG } from '../../lib/debateConfig'

const mockModels = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', architecture: {}, pricing: {} },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', architecture: {}, pricing: {} },
] as never[]

describe('DebateConfigPanel', () => {
  let onChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onChange = vi.fn()
  })

  it('renders all participants', () => {
    render(<DebateConfigPanel config={DEFAULT_DEBATE_CONFIG} models={mockModels} onChange={onChange} />)
    expect(screen.getAllByPlaceholderText('Search models…')).toHaveLength(DEFAULT_DEBATE_CONFIG.participants.length)
  })

  it('calls onChange when round count changes', async () => {
    const user = userEvent.setup()
    render(<DebateConfigPanel config={DEFAULT_DEBATE_CONFIG} models={mockModels} onChange={onChange} />)

    // Find the round count input (type="number")
    const roundInput = screen.getByDisplayValue(String(DEFAULT_DEBATE_CONFIG.roundCount))
    await user.clear(roundInput)
    await user.type(roundInput, '3')
    expect(onChange).toHaveBeenCalled()
  })

  it('renders in collapsed mode', () => {
    render(
      <DebateConfigPanel
        config={DEFAULT_DEBATE_CONFIG}
        models={mockModels}
        onChange={onChange}
        collapsed
        onToggleCollapse={vi.fn()}
      />,
    )
    // In collapsed mode, the config header should show model/round summary
    expect(screen.getByText(/Configure debate/)).toBeTruthy()
  })
})
