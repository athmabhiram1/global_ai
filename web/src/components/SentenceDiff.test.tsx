// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SentenceDiff from './SentenceDiff'

afterEach(() => cleanup())
import type { SentenceDiff as Diff } from '../api'

const diff: Diff = {
  changed: ['Metered billing shipped.'],
  added: [],
  removed: [],
  total: 4,
}

describe('SentenceDiff', () => {
  it('renders with and without memos side by side', () => {
    render(
      <SentenceDiff
        withText="Acme Pro costs $49 per seat. Metered billing shipped."
        withoutText="Acme Pro costs $49 per seat."
        diff={diff}
      />,
    )
    expect(screen.getByText(/with.*original answer/i)).toBeTruthy()
    expect(screen.getByText(/without.*ablated/i)).toBeTruthy()
  })

  it('highlights the changed sentence in both memos', () => {
    render(
      <SentenceDiff
        withText="Acme Pro costs $49 per seat. Metered billing shipped."
        withoutText="Acme Pro costs $49 per seat. Metered billing shipped."
        diff={diff}
      />,
    )
    const changed = screen.getAllByTestId('changed-sentence')
    expect(changed.length).toBeGreaterThanOrEqual(2)
    expect(changed[0].textContent).toContain('Metered billing shipped.')
  })

  it('leaves unchanged sentences unhighlighted', () => {
    render(
      <SentenceDiff
        withText="Acme Pro costs $49 per seat. Metered billing shipped."
        withoutText="Acme Pro costs $49 per seat."
        diff={diff}
      />,
    )
    const unchanged = screen.getAllByText('Acme Pro costs $49 per seat.')
    expect(unchanged.length).toBeGreaterThan(0)
    for (const el of unchanged) {
      expect(el.getAttribute('data-testid')).not.toBe('changed-sentence')
    }
  })
})
