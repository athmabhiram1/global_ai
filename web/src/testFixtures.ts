import type {
  AutopsyResult,
  DecisionDetail,
  DecisionListItem,
  DecisionRow,
  RepItem,
  RepRow,
} from './api'

export const decisionRowFixture: DecisionRow = {
  request_id: 'rq-1',
  policy: 'support-bot',
  mode: 'rewrite',
  chunks_in: 3,
  chunks_kept: 2,
  kept: ['c1', 'c2'],
  dropped: [{ id: 'c3', reason: 'stale' }],
  tokens_in: 4000,
  tokens_out: 3520,
  token_method: 'estimate',
  tavily_credits: 0,
  transport: 'relay',
  duration_ms: 9,
}

export const decisionListItemFixture: DecisionListItem = {
  id: 'rq-1',
  t: '9 ms',
  app: 'support-bot',
  policy: 'support-bot',
  mode: 'rewrite',
  cin: 3,
  cout: 2,
  tin: 4000,
  tout: 3520,
  cred: 0,
  ms: 9,
  fresh: null,
  indep: null,
  transport: 'relay',
  reasons: ['stale'],
  _live: true,
  _raw: decisionRowFixture,
}

export const decisionDetailFixture: DecisionDetail = {
  id: 'rq-1',
  mode: 'rewrite',
  policy: 'support-bot',
  tin: 4000,
  tout: 3520,
  cin: 3,
  cout: 2,
  cred: 0,
  transport: 'relay',
  ms: 9,
  chunks: [
    { id: 'c1', dom: 'docs.example.com', verdict: 'keep' },
    { id: 'c2', dom: 'github.com', verdict: 'keep' },
    { id: 'c3', dom: 'blog.example.com', verdict: 'drop', reason: 'stale' },
  ],
  claims: [
    {
      text: 'Acme Pro costs $49 per seat.',
      source: 'docs.example.com',
      freshness: 0.9,
      evidence: ['c1'],
    },
  ],
}

export const autopsyFixture: AutopsyResult = {
  influence: 0.25,
  diff: { changed: ['Metered billing shipped.'], added: [], removed: [], total: 4 },
  with: 'Acme Pro costs $49 per seat. Metered billing shipped.',
  without: 'Acme Pro costs $49 per seat.',
  cached: false,
}

export const repRowFixture: RepRow = {
  Domain: 'docs.example.com',
  Alpha: 7,
  Beta: 3,
  LastSeen: new Date(Date.now() - 36e5).toISOString(),
  Denied: false,
}

export const repItemFixture: RepItem = {
  domain: 'docs.example.com',
  tier: 'reputable',
  a: 7,
  b: 3,
  seen: '1 h ago',
  apps: ['fleet'],
  denied: false,
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  return { fetchFn: fn as typeof fetch, calls }
}
