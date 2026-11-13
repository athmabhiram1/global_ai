// Seeded sample data for ?demo=1 only. Never used in real mode; every value is illustrative, not measured.
import type { ChunkRecord, DecisionRow, PolicySummary, RepRow } from "./api";

function chunk(
  id: string,
  domain: string,
  verdict: ChunkRecord["verdict"],
  overrides: Partial<ChunkRecord> = {},
): ChunkRecord {
  return {
    id,
    domain,
    verdict,
    authority: "primary",
    freshness_class: "price",
    age_hours: 2,
    tokens: 320,
    provenance: "known",
    refreshed: true,
    refresh_failed: false,
    relevance: 0.9,
    freshness: 0.8,
    independence: 0.7,
    utility: 0.85,
    score: 0.82,
    ...overrides,
  };
}

export const DEMO_DECISIONS: DecisionRow[] = [
  {
    request_id: "d_demo_001",
    policy: "default",
    mode: "rewrite",
    chunks_in: 3,
    chunks_kept: 2,
    kept: ["c1", "c2"],
    dropped: [{ id: "c3", reason: "stale" }],
    chunks: [
      chunk("c1", "docs.example.com", "keep"),
      chunk("c2", "api.example.com", "keep", {
        freshness_class: "version",
        age_hours: 30,
        score: 0.74,
      }),
      chunk("c3", "stale-blog.example.com", "drop", {
        reason: "stale",
        authority: "aggregator",
        freshness_class: "price",
        age_hours: 900,
        provenance: "inferred",
        refreshed: false,
        refresh_failed: true,
        relevance: 0.4,
        freshness: 0.1,
        independence: 0.3,
        utility: 0.2,
        score: 0.18,
      }),
    ],
    tokens_in: 412,
    tokens_out: 362,
    token_method: "estimate",
    tavily_credits: 0,
    transport: "relay",
    duration_ms: 8,
  },
  {
    request_id: "d_demo_002",
    policy: "default",
    mode: "annotate",
    chunks_in: 2,
    chunks_kept: 2,
    kept: ["c4", "c5"],
    dropped: [],
    chunks: [
      chunk("c4", "docs.example.com", "keep"),
      chunk("c5", "api.example.com", "keep", {
        freshness_class: "version",
        age_hours: 12,
        score: 0.77,
      }),
    ],
    tokens_in: 400,
    tokens_out: 392,
    token_method: "estimate",
    tavily_credits: 0,
    transport: "relay",
    duration_ms: 7,
  },
  {
    request_id: "d_demo_003",
    policy: "default",
    mode: "rewrite",
    chunks_in: 2,
    chunks_kept: 0,
    kept: [],
    dropped: [
      { id: "c6", reason: "authority_denied" },
      { id: "c7", reason: "authority_denied" },
    ],
    chunks: [
      chunk("c6", "content-farm.example", "drop", {
        reason: "authority_denied",
        authority: "denied",
        age_hours: 48,
        provenance: "inferred",
        refreshed: false,
        score: 0.05,
      }),
      chunk("c7", "spam.example", "drop", {
        reason: "authority_denied",
        authority: "denied",
        age_hours: 72,
        provenance: "inferred",
        refreshed: false,
        score: 0.03,
      }),
    ],
    tokens_in: 405,
    tokens_out: 12,
    token_method: "estimate",
    tavily_credits: 0,
    transport: "relay",
    duration_ms: 6,
  },
];

export const DEMO_REPUTATION: RepRow[] = [
  {
    Domain: "docs.example.com",
    Alpha: 7,
    Beta: 3,
    LastSeen: "2026-09-01T10:00:00.000Z",
    Denied: false,
  },
  {
    Domain: "api.example.com",
    Alpha: 9,
    Beta: 1,
    LastSeen: "2026-09-02T10:00:00.000Z",
    Denied: false,
  },
  {
    Domain: "stale-blog.example.com",
    Alpha: 2,
    Beta: 5,
    LastSeen: "2026-08-28T10:00:00.000Z",
    Denied: false,
  },
  {
    Domain: "content-farm.example",
    Alpha: 1,
    Beta: 8,
    LastSeen: "2026-08-20T10:00:00.000Z",
    Denied: true,
  },
];

export const DEMO_POLICY_SUMMARY: PolicySummary = {
  effective_mode: "rewrite",
  mode: "rewrite",
  budget: { max_context_tokens: 4000, max_chunks: 8 },
  freshness: { classes: { price: 24, law: 168 } },
  authority: { deny: ["content-farm.example"] },
  independence: {},
  tavily: {},
  claims: null,
  autopsy: {},
};

export const DEMO_DECISION_DETAIL: Record<string, DecisionRow> = Object.fromEntries(
  DEMO_DECISIONS.map((d) => [d.request_id, d]),
);
