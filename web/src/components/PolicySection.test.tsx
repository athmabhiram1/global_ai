// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import PolicySection, { PolicyView } from './PolicySection'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const rawYaml =
  'context_curator:\n  mode: rewrite\n  authority:\n    deny: [content-farm.example]\n'

describe('PolicyView', () => {
  it('shows the live YAML text verbatim', () => {
    render(<PolicyView raw={rawYaml} mode="rewrite" denied={[]} />)
    expect(screen.getByTestId('policy-yaml').textContent).toContain(
      'mode: rewrite',
    )
    expect(screen.getByTestId('policy-yaml').textContent).toContain(
      'content-farm.example',
    )
  })

  it('displays the resolved mode with its description', () => {
    render(<PolicyView raw={rawYaml} mode="rewrite" denied={[]} />)
    expect(screen.getByTestId('policy-mode').textContent).toContain('rewrite')
    expect(screen.getByText(/dropped chunks are removed/i)).toBeTruthy()
  })

  it('lists denied domains as live kill-list chips', () => {
    render(
      <PolicyView
        raw={rawYaml}
        mode="rewrite"
        denied={['content-farm.example']}
      />,
    )
    expect(screen.getByTestId('deny-chips').textContent).toContain(
      'content-farm.example',
    )
  })
})

describe('PolicySection', () => {
  it('fetches the live policy from the sidecar', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return new Response(rawYaml, { status: 200 })
    })
    render(<PolicySection denied={[]} />)
    await waitFor(() =>
      expect(screen.getByTestId('policy-mode').textContent).toContain(
        'rewrite',
      ),
    )
    expect(calls[0]).toContain('/api/context-curator/policy')
  })

  it('shows an empty state when the sidecar has no policy loaded', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('no policy loaded', { status: 503 }),
    )
    render(<PolicySection denied={[]} />)
    await waitFor(() =>
      expect(screen.getByText(/no policy loaded/i)).toBeTruthy(),
    )
  })
})
