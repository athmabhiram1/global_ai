import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  api,
  mapDecisions,
  mapDetail,
  mapRep,
  type DecisionRow,
} from './api'
import { decisionRowFixture, repRowFixture, stubFetch } from './testFixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapDecisions', () => {
  it('maps request rows to UI rows with template keys', () => {
    const [row] = mapDecisions([decisionRowFixture])
    expect(row.id).toBe('rq-1')
    expect(row.policy).toBe('support-bot')
    expect(row.mode).toBe('rewrite')
    expect(row.cin).toBe(3)
    expect(row.cout).toBe(2)
    expect(row.reasons).toEqual(['stale'])
    expect(row._live).toBe(true)
  })

  it('maps null/undefined to an empty list (no data is a valid state)', () => {
    expect(mapDecisions(null)).toEqual([])
    expect(mapDecisions(undefined)).toEqual([])
  })
})

describe('mapDetail', () => {
  it('splits kept and dropped chunks with drop reasons', () => {
    const detail = mapDetail(decisionRowFixture)
    expect(detail.chunks).toHaveLength(3)
    const dropped = detail.chunks.filter((c) => c.verdict === 'drop')
    expect(dropped).toHaveLength(1)
    expect(dropped[0].reason).toBe('stale')
    expect(
      detail.chunks.filter((c) => c.verdict === 'keep').map((c) => c.id),
    ).toEqual(['c1', 'c2'])
  })
})

describe('mapRep', () => {
  it('tiers reputable domains by Beta posterior utility', () => {
    const item = mapRep(repRowFixture)
    expect(item.domain).toBe('docs.example.com')
    expect(item.tier).toBe('reputable')
    expect(item.a).toBe(7)
    expect(item.b).toBe(3)
  })

  it('marks denied domains', () => {
    expect(mapRep({ ...repRowFixture, Denied: true }).tier).toBe('denied')
  })
})

describe('api paths', () => {
  it('decisions() hits the ledger route and maps rows', async () => {
    const { fetchFn, calls } = stubFetch((url) =>
      url.endsWith('/api/context-curator/decisions')
        ? new Response(JSON.stringify([decisionRowFixture]), { status: 200 })
        : new Response('nope', { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchFn)
    const rows = await api.decisions()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/api/context-curator/decisions')
    expect(rows[0].id).toBe('rq-1')
  })

  it('feedback() posts positive=true for good and false for bad', async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify(repRowFixture), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchFn)
    await api.feedback('docs.example.com', 'good')
    await api.feedback('docs.example.com', 'bad')
    expect(calls[0].url).toContain('/api/context-curator/feedback')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      domain: 'docs.example.com',
      positive: true,
    })
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      domain: 'docs.example.com',
      positive: false,
    })
  })

  it('resetRep() posts the domain, or an empty body for reset-all', async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify([]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchFn)
    await api.resetRep('docs.example.com')
    await api.resetRep()
    expect(calls[0].url).toContain('/api/context-curator/reputation/reset')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      domain: 'docs.example.com',
    })
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({})
  })

  it('policyText() reads the live YAML verbatim and extracts the mode', async () => {
    const raw =
      'context_curator:\n  mode: rewrite\n  authority:\n    deny: [content-farm.example]\n'
    const { fetchFn, calls } = stubFetch(() => new Response(raw, { status: 200 }))
    vi.stubGlobal('fetch', fetchFn)
    const policy = await api.policyText()
    expect(calls[0].url).toContain('/api/context-curator/policy')
    expect(policy.raw).toBe(raw)
    expect(policy.mode).toBe('rewrite')
  })

  it('policyText() surfaces the sidecar 503 when no policy is loaded', async () => {
    const { fetchFn } = stubFetch(
      () => new Response('no policy loaded', { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchFn)
    await expect(api.policyText()).rejects.toThrow(
      '/api/context-curator/policy',
    )
  })

  it('autopsy() posts request and chunk ids', async () => {
    const { fetchFn, calls } = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            influence: 0.25,
            diff: { changed: [], added: [], removed: [], total: 1 },
            with: 'a',
            without: 'b',
            cached: false,
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchFn)
    await api.autopsy('rq-1', 'c1')
    expect(calls[0].url).toContain('/api/context-curator/autopsy')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      request_id: 'rq-1',
      chunk_id: 'c1',
    })
  })

  it('keeps decision rows type-compatible with the sidecar model', () => {
    const row: DecisionRow = decisionRowFixture
    expect(row.request_id).toBe('rq-1')
  })
})
