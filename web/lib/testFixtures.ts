import type {
  AutopsyResult,
  ChunkRecord,
  DecisionDetail,
  DecisionListItem,
  DecisionRow,
  RepItem,
  RepRow,
} from "./api";

export const chunkRecordFixture: ChunkRecord = {
  id: "c1",
  domain: "docs.example.com",
  verdict: "keep",
  authority: "primary",
  freshness_class: "price",
  age_hours: 2.5,
  tokens: 320,
  cluster_id: "",
  cluster_size: 0,
  provenance: "known",
  refreshed: true,
  refresh_failed: false,
  source_urls: ["https://docs.example.com/pricing"],
  relevance: 0.9,
  freshness: 0.8,
  independence: 0.7,
  utility: 0.85,
  score: 0.82,
};

export const droppedRecordFixture: ChunkRecord = {
  id: "c3",
  domain: "blog.example.com",
  verdict: "drop",
  reason: "stale",
  authority: "aggregator",
  freshness_class: "price",
  age_hours: 400,
  tokens: 210,
  provenance: "inferred",
  refreshed: false,
  refresh_failed: true,
  relevance: 0.4,
  freshness: 0.1,
  independence: 0.3,
  utility: 0.2,
  score: 0.18,
};

export const decisionRowFixture: DecisionRow = {
  request_id: "rq-1",
  policy: "support-bot",
  mode: "rewrite",
  chunks_in: 3,
  chunks_kept: 2,
  kept: ["c1", "c2"],
  dropped: [{ id: "c3", reason: "stale" }],
  chunks: [
    chunkRecordFixture,
    { ...chunkRecordFixture, id: "c2", domain: "github.com" },
    droppedRecordFixture,
  ],
  tokens_in: 4000,
  tokens_out: 3520,
  token_method: "estimate",
  tavily_credits: 0,
  transport: "relay",
  duration_ms: 9,
};

export const legacyRowFixture: DecisionRow = {
  request_id: "rq-0",
  policy: "support-bot",
  mode: "annotate",
  chunks_in: 3,
  chunks_kept: 2,
  kept: ["c1", "c2"],
  dropped: [{ id: "c3", reason: "stale" }],
  tokens_in: 4000,
  tokens_out: 3520,
  token_method: "estimate",
  tavily_credits: 0,
  transport: "relay",
  duration_ms: 11,
};

export const decisionListItemFixture: DecisionListItem = {
  id: "rq-1",
  t: "9 ms",
  app: "support-bot",
  policy: "support-bot",
  mode: "rewrite",
  cin: 3,
  cout: 2,
  tin: 4000,
  tout: 3520,
  cred: 0,
  ms: 9,
  fresh: null,
  indep: null,
  transport: "relay",
  reasons: ["stale"],
  _live: true,
  _raw: decisionRowFixture,
};

export const decisionDetailFixture: DecisionDetail = {
  id: "rq-1",
  mode: "rewrite",
  policy: "support-bot",
  tin: 4000,
  tout: 3520,
  cin: 3,
  cout: 2,
  cred: 0,
  transport: "relay",
  ms: 9,
  chunks: [
    {
      id: "c1",
      dom: "docs.example.com",
      verdict: "keep",
      score: 0.82,
      record: chunkRecordFixture,
    },
    { id: "c2", dom: "github.com", verdict: "keep" },
    { id: "c3", dom: "blog.example.com", verdict: "drop", reason: "stale" },
  ],
  claims: [],
};

export const autopsyFixture: AutopsyResult = {
  influence: 0.25,
  diff: { changed: ["Metered billing shipped."], added: [], removed: [], total: 4 },
  with: "Acme Pro costs $49 per seat. Metered billing shipped.",
  without: "Acme Pro costs $49 per seat.",
  cached: false,
  with_sentences: [
    "Acme Pro costs $49 per seat.",
    "Metered billing shipped.",
  ],
  without_sentences: ["Acme Pro costs $49 per seat."],
  changed_indices: [1],
  attribution: "docs.example.com mattered: 1/2 changed",
  chunk_domain: "docs.example.com",
  chunk_tokens: 320,
};

export const repRowFixture: RepRow = {
  Domain: "docs.example.com",
  Alpha: 7,
  Beta: 3,
  LastSeen: new Date(Date.now() - 36e5).toISOString(),
  Denied: false,
};

export const repItemFixture: RepItem = {
  domain: "docs.example.com",
  tier: "reputable",
  a: 7,
  b: 3,
  seen: "1 h ago",
  apps: ["fleet"],
  denied: false,
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetchFn: fn as typeof fetch, calls };
}
