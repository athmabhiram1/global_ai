// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Requests, { RequestsTable } from './Requests'
import {
  decisionListItemFixture,
  decisionRowFixture,
  jsonResponse,
} from '../testFixtures'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RequestsTable', () => {
  const rows = [decisionListItemFixture]

  it('renders one row per decision with kept/token/credit cells', () => {
    render(<RequestsTable rows={rows} onOpen={() => {}} />)
    expect(screen.getByText('rq-1')).toBeTruthy()
    expect(screen.getByText('support-bot')).toBeTruthy()
    expect(screen.getByText('2/3')).toBeTruthy()
    expect(screen.getByText('4000→3520')).toBeTruthy()
  })

  it('opens the drawer when a request id is clicked', () => {
    const onOpen = vi.fn()
    render(<RequestsTable rows={rows} onOpen={onOpen} />)
    fireEvent.click(screen.getByText('rq-1'))
    expect(onOpen).toHaveBeenCalledWith('rq-1')
  })
})

describe('Requests page', () => {
  function stubLedger() {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/api/context-curator/decisions'))
        return jsonResponse([decisionRowFixture])
      if (url.includes('/api/context-curator/decisions/'))
        return jsonResponse({ ...decisionRowFixture, kept: ['c1', 'c2'] })
      return new Response('not found', { status: 404 })
    })
  }

  it('loads the decisions table from the sidecar ledger', async () => {
    stubLedger()
    render(<Requests />)
    await waitFor(() => expect(screen.getByText('rq-1')).toBeTruthy())
  })

  it('opens the decision drawer from a table row', async () => {
    stubLedger()
    render(<Requests />)
    await waitFor(() => expect(screen.getByText('rq-1')).toBeTruthy())
    fireEvent.click(screen.getByText('rq-1'))
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeTruthy(),
    )
    expect(screen.getByTestId('dropped-list').textContent).toContain('c3')
  })

  it('shows an empty state when the sidecar returns no decisions', async () => {
    vi.stubGlobal(
      'fetch',
      async (url: string) =>
        url.endsWith('/api/context-curator/decisions')
          ? jsonResponse([])
          : new Response('not found', { status: 404 }),
    )
    render(<Requests />)
    await waitFor(() =>
      expect(screen.getByText(/no decisions yet/i)).toBeTruthy(),
    )
  })
})
