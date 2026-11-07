// Typed fetch client for the cc-sidecar contract.
// Route table: docs/ARCHITECTURE.md §14, sidecar/server.go Handler().
// Field mappers mirror template.html's CC.mapDecisions / CC.mapDetail /
// CC.mapRep — key names are identical so rows render the same.

export interface DropReason {
  id: string
  reason: string
}

// model.Decision JSON shape (plugin/model/model.go).
export interface DecisionRow {
  request_id: string
  policy: string
  mode: string
  chunks_in: number
  chunks_kept: number
  kept: string[]
  dropped: DropReason[]
  tokens_in: number
  tokens_out: number
  token_method: string
  tavily_credits: number
  transport: string
  duration_ms: number
}

// UI row produced by mapDecisions (template.html CC.mapDecisions keys).
export interface DecisionListItem {
  id: string
  t: string
  app: string
  policy: string
  mode: string
  cin: number
  cout: number
  tin: number
  tout: number
  cred: number
  ms: number
  fresh: null
  indep: null
  transport: string
  reasons: string[]
  _live: boolean
  _raw: DecisionRow
}

export interface ChunkView {
  id: string
  dom: string
  verdict: 'keep' | 'drop'
  reason?: string
  // Admission score when the detail carries one; the sidecar ledger does not
  // fabricate scores, so cards render "—" when it is absent.
  score?: number
}

// UI detail produced by mapDetail (template.html CC.mapDetail keys).
export interface DecisionDetail {
  chunks: ChunkView[]
  claims: Claim[]
  id: string
  mode: string
  policy: string
  tin: number
  tout: number
  cin: number
  cout: number
  cred: number
  transport: string
  ms: number
}

// model.Reputation JSON shape (Go default field names).
export interface RepRow {
  Domain: string
  Alpha: number
  Beta: number
  LastSeen: string
  Denied: boolean
}

// UI row produced by mapRep (template.html CC.mapRep keys).
export interface RepItem {
  domain: string
  tier: 'denied' | 'reputable' | 'aggregator' | 'unknown' | 'primary'
  a: number
  b: number
  seen: string
  apps: string[]
  denied: boolean
}

export interface SentenceDiff {
  changed: string[]
  added: string[]
  removed: string[]
  total: number
}

export interface AutopsyResult {
  influence: number
  diff: SentenceDiff
  with: string
  without: string
  cached: boolean
}

export interface Claim {
  text: string
  source: string
  freshness: number
  evidence: string[]
}

export interface Policy {
  mode: string
  [key: string]: unknown
}

// Live policy text served verbatim by the sidecar (config/contextcurator.yaml).
// The sidecar labels it application/json but the body is YAML, so this accessor
// reads text and extracts the mode the way template.html livePolicyText does.
export interface PolicyText {
  raw: string
  mode: string
}

export function parsePolicyMode(raw: string): string {
  const m = raw.match(/^\s*mode:\s*([A-Za-z]+)/m)
  return m ? m[1] : ''
}

const params = new URLSearchParams(
  typeof location !== 'undefined' ? location.search : '',
)

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, '')
}

export const baseUrl: string = stripTrailingSlash(
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_SIDECAR_URL) ||
    params.get('sidecar') ||
    'http://localhost:8090',
)

const token: string =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_CC_ADMIN_TOKEN) ||
  ''

function ageStr(h: number): string {
  return h >= 1 ? h + ' h' : Math.max(1, Math.round(h * 60)) + ' m'
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...((opts.headers as Record<string, string>) || {}),
  }
  const r = await fetch(baseUrl + path, {
    cache: 'no-store',
    ...opts,
    headers,
  })
  if (!r.ok) throw new Error(path + ' -> ' + r.status)
  return r.json() as Promise<T>
}

/** (rows) -> UI rows. Same keys as template.html CC.mapDecisions. */
export function mapDecisions(rows: DecisionRow[] | null | undefined): DecisionListItem[] {
  return (rows || []).map((d) => ({
    id: d.request_id,
    t: (d.duration_ms ?? 0) + ' ms',
    app: d.policy,
    policy: d.policy,
    mode: d.mode,
    cin: d.chunks_in,
    cout: d.chunks_kept,
    tin: d.tokens_in,
    tout: d.tokens_out,
    cred: d.tavily_credits || 0,
    ms: d.duration_ms ?? 0,
    fresh: null,
    indep: null,
    transport: d.transport || '',
    reasons: (d.dropped || []).map((x) => x.reason),
    _live: true,
    _raw: d,
  }))
}

/** (detail) -> UI detail. Same keys as template.html CC.mapDetail. */
export function mapDetail(d: DecisionRow): DecisionDetail {
  const kept: ChunkView[] = (d.kept || []).map((id) => ({
    id,
    dom: id,
    verdict: 'keep' as const,
  }))
  const dropped: ChunkView[] = (d.dropped || []).map((x) => ({
    id: x.id,
    dom: x.id,
    verdict: 'drop' as const,
    reason: x.reason,
  }))
  return {
    chunks: [...kept, ...dropped],
    claims: [],
    id: d.request_id,
    mode: d.mode,
    policy: d.policy,
    tin: d.tokens_in,
    tout: d.tokens_out,
    cin: d.chunks_in,
    cout: d.chunks_kept,
    cred: d.tavily_credits || 0,
    transport: d.transport || '',
    ms: d.duration_ms ?? 0,
  }
}

/** (reputation row) -> UI row. Same keys as template.html CC.mapRep. */
export function mapRep(r: RepRow): RepItem {
  const u = r.Alpha + r.Beta ? r.Alpha / (r.Alpha + r.Beta) : 0.5
  const ago = r.LastSeen
    ? Math.max(0, (Date.now() - Date.parse(r.LastSeen)) / 36e5)
    : 0
  return {
    domain: r.Domain,
    tier: r.Denied
      ? 'denied'
      : u >= 0.65
        ? 'reputable'
        : u >= 0.4
          ? 'aggregator'
          : 'unknown',
    a: r.Alpha,
    b: r.Beta,
    seen: ageStr(ago) + ' ago',
    apps: ['fleet'],
    denied: !!r.Denied,
  }
}

export const api = {
  health(): Promise<{ status: string; service: string }> {
    return req('/healthz')
  },
  policy(): Promise<Policy> {
    return req('/api/context-curator/policy')
  },
  async policyText(): Promise<PolicyText> {
    const r = await fetch(baseUrl + '/api/context-curator/policy', {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    })
    if (!r.ok) throw new Error('/api/context-curator/policy -> ' + r.status)
    const raw = await r.text()
    return { raw, mode: parsePolicyMode(raw) }
  },
  decisions(): Promise<DecisionListItem[]> {
    return req<DecisionRow[]>('/api/context-curator/decisions').then(
      mapDecisions,
    )
  },
  decision(id: string): Promise<DecisionDetail> {
    return req<DecisionRow>(
      '/api/context-curator/decisions/' + encodeURIComponent(id),
    ).then(mapDetail)
  },
  reputation(): Promise<RepItem[]> {
    return req<RepRow[]>('/api/context-curator/reputation').then((rows) =>
      rows.map(mapRep),
    )
  },
  feedback(
    domain: string,
    verdict: 'good' | 'bad',
  ): Promise<RepRow> {
    return req('/api/context-curator/feedback', {
      method: 'POST',
      body: JSON.stringify({ domain, positive: verdict === 'good' }),
    })
  },
  resetRep(domain?: string): Promise<RepRow[]> {
    return req('/api/context-curator/reputation/reset', {
      method: 'POST',
      body: JSON.stringify(domain ? { domain } : {}),
    })
  },
  autopsy(request_id: string, chunk_id: string): Promise<AutopsyResult> {
    return req('/api/context-curator/autopsy', {
      method: 'POST',
      body: JSON.stringify({ request_id, chunk_id }),
    })
  },
  claims(hash: string): Promise<Claim> {
    return req('/api/context-curator/claims/' + encodeURIComponent(hash))
  },
}
