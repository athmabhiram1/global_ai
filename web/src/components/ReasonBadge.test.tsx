// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ReasonBadge from './ReasonBadge'

afterEach(() => cleanup())

describe('ReasonBadge', () => {
  it('renders the drop reason code carried by a killed chunk', () => {
    render(<ReasonBadge reason="stale" />)
    expect(screen.getByText('stale')).toBeTruthy()
  })

  it('renders duplicate reasons with their representative id', () => {
    render(<ReasonBadge reason="duplicate_of:c1" />)
    expect(screen.getByText('duplicate_of:c1')).toBeTruthy()
  })

  it('renders nothing when no reason is given', () => {
    const { container } = render(<ReasonBadge />)
    expect(container.textContent).toBe('')
  })

  it('is identifiable as the reason badge for a dropped chunk', () => {
    render(<ReasonBadge reason="authority_denied" />)
    expect(screen.getByTestId('reason-badge')).toBeTruthy()
    expect(screen.getByText('authority_denied')).toBeTruthy()
  })
})
