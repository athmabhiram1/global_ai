// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DecisionDrawerView } from './DecisionDrawer'

afterEach(() => cleanup())
import { decisionDetailFixture } from '../testFixtures'

describe('DecisionDrawerView', () => {
  it('renders decision stats: mode, policy, chunks, tokens, credits, duration', () => {
    render(<DecisionDrawerView detail={decisionDetailFixture} onAutopsy={() => {}} />)
    expect(screen.getByText('rewrite')).toBeTruthy()
    expect(screen.getByText('support-bot')).toBeTruthy()
    expect(screen.getByText('2/3 kept')).toBeTruthy()
    expect(screen.getByText('4000→3520')).toBeTruthy()
    expect(screen.getByText('9 ms')).toBeTruthy()
  })

  it('lists kept chunks separately from dropped chunks', () => {
    render(<DecisionDrawerView detail={decisionDetailFixture} onAutopsy={() => {}} />)
    const kept = screen.getByTestId('kept-list')
    const dropped = screen.getByTestId('dropped-list')
    expect(kept.textContent).toContain('c1')
    expect(kept.textContent).toContain('c2')
    expect(kept.textContent).not.toContain('c3')
    expect(dropped.textContent).toContain('c3')
    expect(dropped.textContent).not.toContain('c1')
  })

  it('renders a reason badge for every dropped chunk', () => {
    render(<DecisionDrawerView detail={decisionDetailFixture} onAutopsy={() => {}} />)
    expect(screen.getByTestId('reason-badge')).toBeTruthy()
    expect(screen.getByText('stale')).toBeTruthy()
  })

  it('renders chunk scores when the sidecar provides them', () => {
    const detail = {
      ...decisionDetailFixture,
      chunks: [
        { id: 'c1', dom: 'docs.example.com', verdict: 'keep' as const, score: 0.912 },
        ...decisionDetailFixture.chunks.slice(1),
      ],
    }
    render(<DecisionDrawerView detail={detail} onAutopsy={() => {}} />)
    expect(screen.getByText('0.912')).toBeTruthy()
  })

  it('renders claim freshness rows from the decision detail', () => {
    render(<DecisionDrawerView detail={decisionDetailFixture} onAutopsy={() => {}} />)
    expect(screen.getByText('Acme Pro costs $49 per seat.')).toBeTruthy()
    expect(screen.getByText('FRESH 0.90')).toBeTruthy()
  })

  it('shows an empty state when the decision carries no claims', () => {
    render(
      <DecisionDrawerView
        detail={{ ...decisionDetailFixture, claims: [] }}
        onAutopsy={() => {}}
      />,
    )
    expect(screen.getByText(/no claim rows/i)).toBeTruthy()
  })

  it('offers an autopsy trigger for each kept chunk', () => {
    const onAutopsy = vi.fn()
    render(<DecisionDrawerView detail={decisionDetailFixture} onAutopsy={onAutopsy} />)
    const buttons = screen.getAllByTestId('autopsy-trigger')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect(onAutopsy).toHaveBeenCalledWith('c1')
  })

  it('shows an empty state when every chunk was killed', () => {
    const detail = {
      ...decisionDetailFixture,
      chunks: decisionDetailFixture.chunks.filter((c) => c.verdict === 'drop'),
      cout: 0,
    }
    render(<DecisionDrawerView detail={detail} onAutopsy={() => {}} />)
    expect(screen.queryByTestId('autopsy-trigger')).toBeNull()
    expect(screen.getByText(/nothing to ablate/i)).toBeTruthy()
  })
})
