// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Sources, { SourcesTable } from './Sources'
import { repItemFixture, repRowFixture, jsonResponse } from '../testFixtures'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SourcesTable', () => {
  const noop = () => {}

  it('lists one row per domain with tier and alpha/beta', () => {
    render(
      <SourcesTable
        rows={[repItemFixture]}
        denied={[]}
        onGood={noop}
        onBad={noop}
        onDeny={noop}
        onReset={noop}
      />,
    )
    expect(screen.getByText('docs.example.com')).toBeTruthy()
    expect(screen.getByText('reputable')).toBeTruthy()
    expect(screen.getByText('7/3')).toBeTruthy()
  })

  it('wires good/bad/deny/reset buttons to their handlers', () => {
    const onGood = vi.fn()
    const onBad = vi.fn()
    const onDeny = vi.fn()
    const onReset = vi.fn()
    render(
      <SourcesTable
        rows={[repItemFixture]}
        denied={[]}
        onGood={onGood}
        onBad={onBad}
        onDeny={onDeny}
        onReset={onReset}
      />,
    )
    fireEvent.click(screen.getByText('good'))
    fireEvent.click(screen.getByText('bad'))
    fireEvent.click(screen.getByText('deny'))
    fireEvent.click(screen.getByText('reset'))
    expect(onGood).toHaveBeenCalledWith('docs.example.com')
    expect(onBad).toHaveBeenCalledWith('docs.example.com')
    expect(onDeny).toHaveBeenCalledWith('docs.example.com')
    expect(onReset).toHaveBeenCalledWith('docs.example.com')
  })

  it('marks locally denied domains with a denied chip', () => {
    render(
      <SourcesTable
        rows={[repItemFixture]}
        denied={['docs.example.com']}
        onGood={noop}
        onBad={noop}
        onDeny={noop}
        onReset={noop}
      />,
    )
    expect(screen.getByTestId('deny-on-docs.example.com')).toBeTruthy()
  })
})

describe('Sources page', () => {
  function stubReputation(calls: Array<{ url: string; init?: RequestInit }>) {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/api/context-curator/reputation'))
        return jsonResponse([repRowFixture])
      if (url.endsWith('/api/context-curator/feedback'))
        return jsonResponse(repRowFixture)
      if (url.endsWith('/api/context-curator/reputation/reset'))
        return jsonResponse([repRowFixture])
      return new Response('not found', { status: 404 })
    })
  }

  it('loads the reputation table from the sidecar', async () => {
    stubReputation([])
    render(<Sources denied={[]} onToggleDeny={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText('docs.example.com')).toBeTruthy(),
    )
  })

  it('posts good/bad feedback to api.ts and reloads', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    stubReputation(calls)
    render(<Sources denied={[]} onToggleDeny={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText('docs.example.com')).toBeTruthy(),
    )
    fireEvent.click(screen.getByText('good'))
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/context-curator/feedback') &&
            String(c.init?.body).includes('"positive":true'),
        ),
      ).toBe(true),
    )
    fireEvent.click(screen.getByText('bad'))
    await waitFor(() =>
      expect(
        calls.some((c) =>
          String(c.init?.body).includes('"positive":false'),
        ),
      ).toBe(true),
    )
  })

  it('posts reset-all without a domain body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    stubReputation(calls)
    render(<Sources denied={[]} onToggleDeny={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText('docs.example.com')).toBeTruthy(),
    )
    fireEvent.click(screen.getByText('Reset all'))
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith('/api/context-curator/reputation/reset') &&
            String(c.init?.body) === '{}',
        ),
      ).toBe(true),
    )
  })

  it('shows an empty state when the sidecar returns no reputation rows', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/api/context-curator/reputation')
        ? jsonResponse([])
        : new Response('not found', { status: 404 }),
    )
    render(<Sources denied={[]} onToggleDeny={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/no reputation rows/i)).toBeTruthy(),
    )
  })
})
