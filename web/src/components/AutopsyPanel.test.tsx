// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import AutopsyPanel, { AutopsyResultView } from './AutopsyPanel'
import { autopsyFixture } from '../testFixtures'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AutopsyResultView', () => {
  it('renders the influence score', () => {
    render(<AutopsyResultView result={autopsyFixture} chunkId="c7" />)
    expect(screen.getByText('0.25')).toBeTruthy()
  })

  it('renders with/without memos for the ablation', () => {
    render(<AutopsyResultView result={autopsyFixture} chunkId="c7" />)
    expect(screen.getByText(/with.*original answer/i)).toBeTruthy()
    expect(screen.getByText(/without.*ablated/i)).toBeTruthy()
  })

  it('renders changed sentences with the changed/total count', () => {
    render(<AutopsyResultView result={autopsyFixture} chunkId="c7" />)
    expect(screen.getByText(/1 \/ 4 sentences changed/i)).toBeTruthy()
    expect(screen.getAllByTestId('changed-sentence').length).toBeGreaterThan(0)
  })

  it('marks cached replays', () => {
    render(
      <AutopsyResultView
        result={{ ...autopsyFixture, cached: true }}
        chunkId="c7"
      />,
    )
    expect(screen.getByText('cached')).toBeTruthy()
  })
})

describe('AutopsyPanel', () => {
  it('runs the ablation through api.autopsy and shows the proof', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string) => {
        calls.push(url)
        return new Response(JSON.stringify(autopsyFixture), { status: 200 })
      },
    )
    render(<AutopsyPanel requestId="rq-1" chunkId="c1" />)
    fireEvent.click(screen.getByText('Run ablation'))
    await waitFor(() => expect(screen.getByText('0.25')).toBeTruthy())
    expect(calls[0]).toContain('/api/context-curator/autopsy')
    expect(screen.getByText(/1 \/ 4 sentences changed/i)).toBeTruthy()
  })

  it('surfaces sidecar errors with a retry affordance', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('boom', { status: 500 }),
    )
    render(<AutopsyPanel requestId="rq-1" chunkId="c1" />)
    fireEvent.click(screen.getByText('Run ablation'))
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy())
  })
})
