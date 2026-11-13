// Typed fetch client for the cc-sidecar contract, via the same-origin
// Next.js proxy at /api/cc/* (app/api/cc/[...path]/route.ts injects the
// bearer token server-side, so the browser never sees CC_ADMIN_TOKEN).
//
// Field names mirror the Go JSON (snake_case). Decision rows may carry full
// ChunkRecords (new backend) or only kept/dropped ID lists (old rows) —
// mapDetail prefers records and falls back to ID-only chunks.
//
// Demo mode (?demo=1): read paths serve the illustrative DEMO_* seed and
// mutations apply to an in-memory copy. Real mode is byte-for-byte unchanged.

import { isDemoStart } from "./tour";
import {
  DEMO_DECISIONS,
  DEMO_DECISION_DETAIL,
  DEMO_POLICY_SUMMARY,
  DEMO_REPUTATION,
} from "./demoSeed";

export interface DropReason {
  id: string;
  reason: string;
}

export type ChunkVerdict = "keep" | "drop";

// model.ChunkRecord JSON shape (plugin/model/model.go). Additive: old
// decision rows have no Chunks JSON and load through the ID-only fallback.
export interface ChunkRecord {
  id: string;
  domain: string;
  verdict: ChunkVerdict;
  reason?: string;
  authority: string;
  freshness_class: string;
  age_hours: number;
  tokens: number;
  cluster_id?: string;
  cluster_size?: number;
  provenance: string;
  refreshed: boolean;
  refresh_failed: boolean;
  source_urls?: string[];
  relevance: number;
  freshness: number;
  independence: number;
  utility: number;
  score: number;
}

// model.Decision JSON shape (plugin/model/model.go).
export interface DecisionRow {
  request_id: string;
  policy: string;
  mode: string;
  chunks_in: number;
  chunks_kept: number;
  kept: string[];
  dropped: DropReason[];
  /** Full per-chunk records; absent on rows written before ChunkRecord. */
  chunks?: ChunkRecord[];
  tokens_in: number;
  tokens_out: number;
  token_method: string;
  tavily_credits: number;
  transport: string;
  duration_ms: number;
}

// UI row produced by mapDecisions. Same keys as template.html CC.mapDecisions.
export interface DecisionListItem {
  id: string;
  t: string;
  app: string;
  policy: string;
  mode: string;
  cin: number;
  cout: number;
  tin: number;
  tout: number;
  cred: number;
  ms: number;
  fresh: null;
  indep: null;
  transport: string;
  reasons: string[];
  _live: boolean;
  _raw: DecisionRow;
}

export interface ChunkView {
  id: string;
  dom: string;
  verdict: ChunkVerdict;
  reason?: string;
  // Admission score when the detail carries one; the sidecar ledger does not
  // fabricate scores, so cards render "—" when it is absent.
  score?: number;
  // Full record when the row carries Chunks JSON; undefined for legacy rows.
  record?: ChunkRecord;
}

// UI detail produced by mapDetail. Same keys as template.html CC.mapDetail.
export interface DecisionDetail {
  chunks: ChunkView[];
  claims: Claim[];
  id: string;
  mode: string;
  policy: string;
  tin: number;
  tout: number;
  cin: number;
  cout: number;
  cred: number;
  transport: string;
  ms: number;
}

// model.Reputation JSON shape (Go default field names).
export interface RepRow {
  Domain: string;
  Alpha: number;
  Beta: number;
  LastSeen: string;
  Denied: boolean;
}

// UI row produced by mapRep. Same keys as template.html CC.mapRep.
export interface RepItem {
  domain: string;
  tier: "denied" | "reputable" | "aggregator" | "unknown" | "primary";
  a: number;
  b: number;
  seen: string;
  apps: string[];
  denied: boolean;
}

export interface SentenceDiff {
  changed: string[];
  added: string[];
  removed: string[];
  total: number;
}

// sidecar AutopsyResult: legacy with/without/diff always present; the
// extended sentence arrays + attribution arrive once the retained-only
// autopsy backend lands. All extended fields are optional.
export interface AutopsyResult {
  influence: number;
  diff: SentenceDiff;
  with: string;
  without: string;
  cached: boolean;
  with_sentences?: string[];
  without_sentences?: string[];
  changed_indices?: number[];
  attribution?: string;
  chunk_domain?: string;
  chunk_tokens?: number;
  // Narrative fields the sidecar may return; rendered only when present,
  // never fabricated from other fields.
  quote?: string;
  verdict?: string;
  /** Run label the sidecar attaches (e.g. "ON FILE"); shown as a .samp chip. */
  sample?: string;
}

export interface Claim {
  text: string;
  source: string;
  freshness: number;
  evidence: string[];
  /** Optional contradiction note; rendered as .cf only when provided. */
  conflict?: string;
}

export interface PolicySummary {
  effective_mode?: string;
  mode?: string;
  budget?: Record<string, unknown>;
  freshness?: Record<string, unknown>;
  authority?: Record<string, unknown>;
  independence?: Record<string, unknown>;
  tavily?: Record<string, unknown>;
  claims?: Record<string, unknown> | null;
  autopsy?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Policy {
  mode: string;
  [key: string]: unknown;
}

// Live policy text served verbatim by the sidecar (config/contextcurator.yaml).
export interface PolicyText {
  raw: string;
  mode: string;
}

export function parsePolicyMode(raw: string): string {
  const m = raw.match(/^\s*mode:\s*([A-Za-z]+)/m);
  return m ? m[1] : "";
}

function ageStr(h: number): string {
  return h >= 1 ? h + " h" : Math.max(1, Math.round(h * 60)) + " m";
}

/** True only when the URL carries ?demo (any value). False server-side. */
export function isDemoMode(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return isDemoStart(window.location.search);
  } catch {
    return false;
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// In-memory demo store: a writable copy of the seed. Mutations (feedback,
// deny, setMode, resetRep) apply here; reads serve from here.
let demoDecisions: DecisionRow[] = clone(DEMO_DECISIONS);
let demoDetail: Record<string, DecisionRow> = clone(DEMO_DECISION_DETAIL);
let demoReputation: RepRow[] = clone(DEMO_REPUTATION);
let demoMode: string = "rewrite";

/** Restore the demo store to the seed (used by tests). */
export function __resetDemoStore(): void {
  demoDecisions = clone(DEMO_DECISIONS);
  demoDetail = clone(DEMO_DECISION_DETAIL);
  demoReputation = clone(DEMO_REPUTATION);
  demoMode = "rewrite";
}

/** Same-origin proxy prefix. The route handler injects auth server-side. */
export const proxyPrefix = "/api/cc";

async function req<T>(sidecarPath: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  const r = await fetch(proxyPrefix + sidecarPath, {
    cache: "no-store",
    ...opts,
    headers,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    const msg = body ? `: ${body.slice(0, 300)}` : "";
    throw new Error(`${sidecarPath} -> ${r.status}${msg}`);
  }
  return r.json() as Promise<T>;
}

/** (rows) -> UI rows. Same keys as template.html CC.mapDecisions. */
export function mapDecisions(
  rows: DecisionRow[] | null | undefined,
): DecisionListItem[] {
  return (rows || []).map((d) => ({
    id: d.request_id,
    t: (d.duration_ms ?? 0) + " ms",
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
    transport: d.transport || "",
    reasons: (d.dropped || []).map((x) => x.reason),
    _live: true,
    _raw: d,
  }));
}

function recordToView(c: ChunkRecord): ChunkView {
  return {
    id: c.id,
    dom: c.domain || c.id,
    verdict: c.verdict,
    reason: c.reason,
    score: c.score,
    record: c,
  };
}

/** (detail) -> UI detail. Prefers full ChunkRecords, falls back to ID-only. */
export function mapDetail(d: DecisionRow): DecisionDetail {
  let chunks: ChunkView[];
  if (Array.isArray(d.chunks) && d.chunks.length > 0) {
    chunks = d.chunks.map(recordToView);
  } else {
    const kept: ChunkView[] = (d.kept || []).map((id) => ({
      id,
      dom: id,
      verdict: "keep" as const,
    }));
    const dropped: ChunkView[] = (d.dropped || []).map((x) => ({
      id: x.id,
      dom: x.id,
      verdict: "drop" as const,
      reason: x.reason,
    }));
    chunks = [...kept, ...dropped];
  }
  const claims = (d as { claims?: Claim[] }).claims ?? [];
  return {
    chunks,
    claims,
    id: d.request_id,
    mode: d.mode,
    policy: d.policy,
    tin: d.tokens_in,
    tout: d.tokens_out,
    cin: d.chunks_in,
    cout: d.chunks_kept,
    cred: d.tavily_credits || 0,
    transport: d.transport || "",
    ms: d.duration_ms ?? 0,
  };
}

/** (reputation row) -> UI row. Same keys as template.html CC.mapRep. */
export function mapRep(r: RepRow): RepItem {
  const u = r.Alpha + r.Beta ? r.Alpha / (r.Alpha + r.Beta) : 0.5;
  const ago = r.LastSeen
    ? Math.max(0, (Date.now() - Date.parse(r.LastSeen)) / 36e5)
    : 0;
  return {
    domain: r.Domain,
    tier: r.Denied
      ? "denied"
      : u >= 0.65
        ? "reputable"
        : u >= 0.4
          ? "aggregator"
          : "unknown",
    a: r.Alpha,
    b: r.Beta,
    seen: ageStr(ago) + " ago",
    apps: ["fleet"],
    denied: !!r.Denied,
  };
}

const CC = "/api/context-curator";

export const api = {
  health(): Promise<{ status: string; service: string }> {
    return req("/healthz");
  },
  policy(): Promise<Policy> {
    if (isDemoMode()) return Promise.resolve({ mode: demoMode });
    return req(`${CC}/policy`);
  },
  async policyText(): Promise<PolicyText> {
    const r = await fetch(proxyPrefix + `${CC}/policy`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${CC}/policy -> ${r.status}`);
    const raw = await r.text();
    return { raw, mode: parsePolicyMode(raw) };
  },
  policySummary(): Promise<PolicySummary> {
    if (isDemoMode()) {
      return Promise.resolve({
        ...clone(DEMO_POLICY_SUMMARY),
        effective_mode: demoMode,
        mode: demoMode,
      });
    }
    return req(`${CC}/policy/summary`);
  },
  setMode(mode: "annotate" | "rewrite" | "block"): Promise<{ mode: string }> {
    if (isDemoMode()) {
      demoMode = mode;
      return Promise.resolve({ mode });
    }
    return req(`${CC}/policy/mode`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  },
  decisions(): Promise<DecisionListItem[]> {
    if (isDemoMode()) return Promise.resolve(mapDecisions(demoDecisions));
    return req<DecisionRow[]>(`${CC}/decisions`).then(mapDecisions);
  },
  decisionRows(): Promise<DecisionRow[]> {
    if (isDemoMode()) return Promise.resolve(clone(demoDecisions));
    return req<DecisionRow[]>(`${CC}/decisions`);
  },
  decision(id: string): Promise<DecisionDetail> {
    if (isDemoMode()) {
      const row = demoDetail[id];
      if (!row) {
        return Promise.reject(
          new Error(`${CC}/decisions/${id} -> 404: not found`),
        );
      }
      return Promise.resolve(mapDetail(clone(row)));
    }
    return req<DecisionRow>(
      `${CC}/decisions/` + encodeURIComponent(id),
    ).then(mapDetail);
  },
  reputation(): Promise<RepItem[]> {
    if (isDemoMode())
      return Promise.resolve(demoReputation.map((r) => mapRep(clone(r))));
    return req<RepRow[]>(`${CC}/reputation`).then((rows) =>
      rows.map(mapRep),
    );
  },
  feedback(domain: string, verdict: "good" | "bad"): Promise<RepRow> {
    if (isDemoMode()) {
      let row = demoReputation.find((r) => r.Domain === domain);
      if (!row) {
        row = {
          Domain: domain,
          Alpha: 1,
          Beta: 1,
          LastSeen: new Date().toISOString(),
          Denied: false,
        };
        demoReputation.push(row);
      }
      if (verdict === "good") row.Alpha += 1;
      else row.Beta += 1;
      row.LastSeen = new Date().toISOString();
      return Promise.resolve(clone(row));
    }
    return req(`${CC}/feedback`, {
      method: "POST",
      body: JSON.stringify({ domain, positive: verdict === "good" }),
    });
  },
  deny(domain: string, denied = true): Promise<RepRow> {
    if (isDemoMode()) {
      let row = demoReputation.find((r) => r.Domain === domain);
      if (!row) {
        row = {
          Domain: domain,
          Alpha: 1,
          Beta: 1,
          LastSeen: new Date().toISOString(),
          Denied: denied,
        };
        demoReputation.push(row);
      } else {
        row.Denied = denied;
        row.LastSeen = new Date().toISOString();
      }
      return Promise.resolve(clone(row));
    }
    return req(`${CC}/deny`, {
      method: "POST",
      body: JSON.stringify({ domain, denied }),
    });
  },
  resetRep(domain?: string): Promise<RepRow[]> {
    if (isDemoMode()) {
      const fresh = (): RepRow => ({
        Domain: "",
        Alpha: 1,
        Beta: 1,
        LastSeen: new Date().toISOString(),
        Denied: false,
      });
      if (domain) {
        const row = demoReputation.find((r) => r.Domain === domain);
        if (row) {
          row.Alpha = 1;
          row.Beta = 1;
          row.Denied = false;
          row.LastSeen = new Date().toISOString();
          return Promise.resolve([clone(row)]);
        }
        return Promise.resolve([]);
      }
      demoReputation = demoReputation.map((r) => ({
        ...fresh(),
        Domain: r.Domain,
      }));
      return Promise.resolve(clone(demoReputation));
    }
    return req(`${CC}/reputation/reset`, {
      method: "POST",
      body: JSON.stringify(domain ? { domain } : {}),
    });
  },
  autopsy(request_id: string, chunk_id: string): Promise<AutopsyResult> {
    return req(`${CC}/autopsy`, {
      method: "POST",
      body: JSON.stringify({ request_id, chunk_id }),
    });
  },
  claims(hash: string): Promise<Claim> {
    return req(`${CC}/claims/` + encodeURIComponent(hash));
  },
};
