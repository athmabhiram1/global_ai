# Architecture — Context Curator

**Status:** rev. 2 — corrected against live Bifrost docs
**Companion docs:** `docs/PRD.md`, `docs/VERIFICATION.md`, `docs/superpowers/plans/2026-11-03-context-curator.md`

---

## 1. What changed from rev. 1

| rev. 1 | rev. 2 | Why |
|---|---|---|
| Fork Bifrost, compile plugin in | Standalone repo, `.so` plugin | Bifrost documents dynamic plugin loading; a fork is not a standard installation |
| `PreRequestHook` mutates `req.Input` | `PreRequestHook` mutates `req.ChatRequest.Input` | Source confirms *any* field mutation commits across fallbacks; docs page was incomplete |
| Handlers inside `transports/bifrost-http/handlers` | Sidecar service | `.so` plugins cannot register HTTP routes |
| Docker compose with 3 services | **One container, three processes** | Demo must be one command to run and one image to share |

---

## 2. System topology

```
┌─────────────────────────── one container ────────────────────────────┐
│                                                                       │
│  tini → docker-entrypoint.sh                                        │
│   ├── bifrost-http :8080          (dynamically linked, stock source)  │
│   │     └── loads contextcurator.so via plugin.Open()                 │
│   │           PreRequestHook → full admission pipeline               │
│   │           PostLLMHook    → persist decision to SQLite             │
│   │           HTTPTransportResponseHeadersHook → x-cc-decision-id     │
│   │                                                                   │
│   └── cc-sidecar :8090                                                │
│         ├── /            built React UI from /srv/web                 │
│         │                (single-file console at /temp1.html)         │
│         └── /api/*       autopsy, reputation, feedback, policy,       │
│                          claims/score                                 │
│                                                                       │
│  shared volume: /data/contextcurator.db  (SQLite, WAL)                │
└───────────────────────────────────────────────────────────────────────┘
          ▲                    ▲                          │
          │                    │                          ▼
   demo apps (host)      Tavily API                LLM providers
   3 HTTP clients        relay or direct          (OpenAI + mock)
```

Two exposed ports: **8080** (Bifrost, OpenAI-compatible) and **8090** (UI + sidecar API).

The demo apps are **not** in the container. They run on the host and point at `localhost:8080`, so a judge can see three ordinary apps that know nothing about the curator.

---

## 3. Why `.so`, and why it is safe

Bifrost's plugin system is Go's native `plugin` package. Constraints, from the official docs:

- Linux and macOS only. **Windows is not supported.**
- The plugin must be built with the **same Go version** and the **same architecture** as the Bifrost binary.
- The binary must be **dynamically linked**; static builds cannot load plugins.

All three constraints vanish inside a Docker build:

```dockerfile
# one stage, one toolchain, no drift possible
FROM golang:<version-from-bifrost-go.mod> AS builder
WORKDIR /src
COPY bifrost-src/ ./
RUN make build DYNAMIC=1            # produces tmp/bifrost-http, dynamically linked
COPY plugin/ /plugin/
WORKDIR /plugin
RUN go build -buildmode=plugin -o /out/contextcurator.so .
```

The plugin module pins `github.com/maximhq/bifrost/core` to the exact version the binary was built from. Because both are compiled in the same stage, a version mismatch cannot occur.

The user never needs Go, never needs WSL, never compiles anything.

**If `DYNAMIC=1` fails in Wave 0**, the fallback is the same build with the static flags removed manually (`-extldflags "-static"` dropped, `sqlite_static` tag dropped, `CGO_ENABLED=1`). That is what `DYNAMIC=1` does.

---

## 4. Hook placement

```
HTTP request
  │
  ├─ HTTPTransportPreAuthHook
  ├─ HTTPTransportPreHook
  │
  ├─ PreRequestHook          ◄── the entire pipeline, once per request
  │     1. resolve policy (virtual key → route → default)
  │     2. if not a chat request → return
  │     3. reserve max_tavily_credits for this request on ctx
  │     4. segment candidate context
  │     5. compute provenance
  │     6. hard-deny check
  │     7. score chunks
  │     8. refresh stale chunks (Tavily, within reserved budget)
  │     9. cluster near-duplicates
  │    10. select under budget (MMR)
  │    11. rewrite req.ChatRequest.Input
  │    12. stash decision on ctx
  │
  ├─ provider call (with fallbacks)
  │
  ├─ PostLLMHook (per attempt)
  │    13. persist decision to SQLite
  │
  ├─ HTTPTransportResponseHeadersHook
  │    14. x-cc-decision-id: <id>
  │
  └─ HTTP response
```

### Why `PreRequestHook` carries the rewrite

`core/bifrost.go:9827-9856` is unambiguous:

> Plugins mutate `req.Provider`, `req.Model`, `req.Fallbacks` (and any other field they choose);
> mutations are committed to the shared `*BifrostRequest` and observed by every subsequent plugin,
> the provider call, and every fallback attempt. [...] `PreRequestHook` runs exactly once at the
> top of `handleRequest`/`handleStreamRequest`, before any fan-out.

"Any other field they choose" includes `ChatRequest.Input`. Running the pipeline here means:

- it runs **exactly once**, so no memo is needed to avoid double Tavily spend on failover;
- the rewrite is committed, so every fallback attempt sees the curated context;
- there is no per-attempt state to keep coherent.

The docs page that says only Provider/Model/Fallbacks are committed is incomplete; the source and
its callers are the authority. Wave 0.3 proves this empirically before any product code depends on it.

### What we deliberately do not use

`PreLLMHook` runs once per provider attempt and returns a replacement request that is not committed
back. For this product that is strictly worse: it would re-run the pipeline on every failover and
re-spend Tavily credits unless we added a memo. We omit it.

### Why decisions are not in `ExtraFields`

`BifrostResponseExtraFields` has no generic map, and a `.so` plugin cannot add a field without
patching core. Decisions are written to SQLite by `PostLLMHook`; the sidecar serves them; the
response carries `x-cc-decision-id` for correlation.

---

## 5. Components

### Plugin (in-process)

| File | Responsibility |
|---|---|
| `plugin/main.go` | Exported `Init`, `GetName`, `PreRequestHook`, `PostLLMHook`, `Cleanup` |
| `plugin/config.go` | Parse + validate policy, defaults |
| `plugin/segmenter.go` | Split context into chunks with stable IDs |
| `plugin/provenance.go` | URL, domain, fetch time, hash, tool call ID |
| `plugin/tokens.go` | Token counting with reported method |
| `plugin/scorer.go` | Relevance, authority, freshness, independence, utility |
| `plugin/policy.go` | Resolve and enforce rules |
| `plugin/cluster.go` | Near-duplicate clustering |
| `plugin/selector.go` | MMR under budget with min-sources floor |
| `plugin/rewriter.go` | Rebuild `req.Input`, append source list |
| `plugin/recorder.go` | Decision → `ExtraFields` + SQLite |
| `plugin/freshness.go` | Stale detection, refresh orchestration, credit budget |
| `plugin/retriever/` | `chain.go`, `relay.go`, `http.go` |
| `plugin/store/` | SQLite access (WAL, busy timeout) |
| `plugin/reputation.go` | Beta posteriors, decay |

### Sidecar

| File | Responsibility |
|---|---|
| `sidecar/main.go` | HTTP server, static UI, graceful shutdown |
| `sidecar/autopsy.go` | Replay with/without a chunk, orchestration, cache |
| `sidecar/replayer.go` | Calls Bifrost's inference endpoint with the original virtual key |
| `sidecar/diff.go` | Sentence split, LCS alignment, influence score |
| `sidecar/claims.go` | LLM claim extraction + per-claim freshness (FR-9) |
| `sidecar/api.go` | Policy, reputation, feedback, autopsy, decisions |
| `sidecar/store.go` | Shared SQLite access |

### Web

| File | Responsibility |
|---|---|
| `web/` | Vite + React + Tailwind. Drawer and Context page. |

---

## 6. Data model

### Chunk

```go
type Chunk struct {
    ID             string
    ToolCallID     string
    SourceURLs     []string
    Domain         string
    FetchedAt      time.Time
    ContentHash    string
    Tokens         int
    Text           string
    Authority      AuthorityTier   // primary | reputable | aggregator | unknown | denied
    FreshnessClass string          // price | version | law | static
    ClusterID      string
    ClusterSize    int
    Relevance      float64
    Freshness      float64
    Independence   float64
    Utility        float64
    Score          float64
    Provenance     ProvenanceConfidence // known | inferred
    Refreshed      bool
    RefreshFailed  bool
}
```

### Decision

```go
type Decision struct {
    RequestID          string
    Policy             string
    Mode               Mode
    ChunksIn           int
    ChunksKept         int
    TokensIn           int
    TokensOut          int
    TokenMethod        string   // "tokenizer" | "estimate"
    FreshnessScore     float64
    IndependentSources int
    TavilyCredits      int
    Transport          string   // "relay" | "http" | ""
    Dropped            []DropReason
    Kept               []string
    DurationMs         int64
}
```

### Drop reason codes

`stale`, `duplicate_of:<id>`, `authority_denied`, `low_relevance`, `over_budget`, `policy_min_sources`, `refresh_failed`, `provenance_unknown`.

### Reputation

```go
type Reputation struct {
    Domain   string
    Alpha    float64
    Beta     float64
    LastSeen time.Time
    Denied   bool
}
```

---

## 7. Scoring

```
score = 0.35*relevance + 0.20*authority + 0.20*freshness
      + 0.15*independence + 0.10*utility
```

| Component | Computation |
|---|---|
| Relevance | BM25 over query terms |
| Authority | primary 1.0, reputable 0.8, aggregator 0.5, unknown 0.3, denied 0.0 |
| Freshness | `exp(-age_hours / half_life_hours(class))` |
| Independence | `1 / max(cluster_size, 1)` |
| Utility | `alpha / (alpha + beta)`, default 0.5 |

Selection: greedy MMR, `lambda = 0.7`, under `max_context_tokens`, floor of one chunk per independent cluster when `min_sources` requires it.

### Classification and stale supersession (`plugin/classify.go`)

Tool context arrives with `FetchedAt = now`, so fetch age can never mark it
stale. The only age signal a tool chunk carries is a year it declares in its
own text, and the PRD requires chunks classified into price, version, law,
static. `ClassifyChunk` assigns the class from content signals with fixed
precedence price > version > law > static; `StatementYear` extracts the
latest explicit four-digit year (release numbers like `3.2` never match);
`StaleByStatement` marks a prior-calendar-year statement stale only in a
sub-year class (static content never goes stale by year).

`Supersede` refuses stale chunks with `ReasonStale`, but only where at least
one fresh chunk of the same class is admitted: a lone witness is always kept
(degradation, never a gap), and block mode still fires only on hard denies
because supersession runs after the block gate. It runs before clustering so
a superseded chunk never becomes a cluster representative. Live Tavily
refresh (`Refresh`, §4 step 8) stays the path that can rehabilitate a stale
chunk with a URL; supersession is what refuses it when no refresh is
possible.

**Determinism:** every tie breaks on content hash. No map iteration order anywhere in the decision path. Scores rounded to 6 decimals so golden tests are stable.

---

## 8. Policy schema

```yaml
context_curator:
  enabled: true
  mode: rewrite            # annotate | block | rewrite
  store_path: /data/contextcurator.db
  budget:
    max_context_tokens: 4000
    max_chunks: 8
    max_tavily_credits: 2
  freshness:
    default_max_age_hours: 168
    classes:
      price: 24
      version: 720
      law: 168
      static: 8760
  authority:
    allow: ["*.gov", "*.edu", "docs.*", "github.com"]
    deny: ["content-farm.example"]
    require_primary_for: ["price", "security"]
  independence:
    min_sources: 2
    near_duplicate_threshold: 0.85
  tavily:
    transport_order: [relay, http]
    relay_name: tavily
    search_depth: basic
    max_age_hours: 24
    timeout_ms: 900
  claims:
    enabled: true
    model: gpt-4o-mini
    max_claims_per_request: 12
  autopsy:
    max_ablations: 5
    cache_ttl_minutes: 60
```

Validation: `mode` in the enum; `max_context_tokens > 0`; `near_duplicate_threshold` in `(0,1]`; `transport_order` non-empty and a subset of `{relay, http}`; `require_primary_for` entries must be known freshness classes.

---

## 9. Tavily integration

```go
type Retriever interface {
    Name() string
    Search(ctx context.Context, q Query) ([]Result, error)
    Extract(ctx context.Context, urls []string, q string) ([]Result, error)
}
```

**Chain:** `relay → http`. Relay is preferred because Bifrost then prices and logs the Tavily call itself — a visible gateway-integration win. Direct HTTP is the guaranteed path and is implemented first.

Relay target: `http://127.0.0.1:8080/relay/tavily/search` and `/extract`. No auth header; the relay injects the credential.

Direct target: `https://api.tavily.com/search`, bearer `TAVILY_API_KEY`.

**Search parameters:** `search_depth` from policy, `max_age_hours` from the chunk's freshness class (capped at 720), `include_domains` from the allow-list, `max_results: 5`.

**Extract:** top result URL, `extract_depth: basic`, `query` = the chunk's claim, `chunks_per_source: 3`.

**Credit budget:** reserved at `PreRequestHook`, decremented per call, never exceeded. `usage.credits` read from the response when present. Verdicts cached by `(content_hash, max_age_hours)`.

**Degradation:** any transport failure marks `refresh_failed` and continues. The request is never blocked by Tavily.

---

## 10. Claim freshness (FR-9)

Runs in the sidecar, never in the admission path.

```
retained chunk
   → LLM claim extraction (cached by content hash)
   → per-claim Tavily search with max_age_hours
   → similarity(claim, evidence)
   → freshness score per claim
```

Output attached to the decision record and rendered in the UI as a per-claim badge. Cached aggressively; skipped if `claims.enabled` is false or the model is unavailable.

This is the explicit answer to the Tavily theme and the visible "use of AI" surface.

---

## 11. Autopsy

```
POST /api/context-curator/autopsy
{ "request_id": "...", "chunk_id": "c7" }
```

1. Load the recorded request from SQLite.
2. Replay with the chunk present.
3. Replay with the chunk removed.
4. Sentence-split and align with LCS.
5. `influence = changed_sentences / total_sentences`.
6. Cache by `(request_id, chunk_id)` for 60 minutes.

Constraints: temperature 0, same provider and model as the original, original virtual key's permissions, max 5 ablations per call, never on the serving path.

Replay calls Bifrost's own `/v1/chat/completions` on `127.0.0.1:8080` with the plugin temporarily bypassed for that request (a `x-cc-bypass: 1` header the plugin honours). This avoids recursion and keeps replay honest.

---

## 12. Reputation and cross-app learning

- Beta(α, β) per domain, initialised `(1, 1)`.
- Sources of feedback: explicit good/bad on a request, correction events, policy pass after a keep.
- Update: `α += 1` positive, `β += 1` negative. Cap 10,000. Decay `0.99/day` toward the prior.
- Utility = posterior mean, read by the scorer with a per-request cache.
- **One table, all apps.** No per-app silo. This is the differentiator.

Storage lives in SQLite, written by the sidecar, read by the plugin.

---

## 13. Storage

SQLite at `/data/contextcurator.db`, WAL mode, `busy_timeout=5000`.

```sql
CREATE TABLE decisions (
  request_id TEXT PRIMARY KEY,
  created_at INTEGER,
  decision   TEXT,   -- JSON
  request    TEXT    -- JSON, redacted
);

CREATE TABLE reputation (
  domain TEXT PRIMARY KEY,
  alpha REAL, beta REAL,
  last_seen INTEGER, denied INTEGER
);

CREATE TABLE verdict_cache (
  content_hash TEXT, max_age_hours INTEGER,
  verdict TEXT, fetched_at INTEGER,
  PRIMARY KEY (content_hash, max_age_hours)
);

CREATE TABLE autopsy_cache (
  request_id TEXT, chunk_id TEXT,
  result TEXT, created_at INTEGER,
  PRIMARY KEY (request_id, chunk_id)
);

CREATE TABLE claims (
  content_hash TEXT, claim TEXT,
  freshness REAL, evidence TEXT, created_at INTEGER,
  PRIMARY KEY (content_hash, claim)
);
```

Writer discipline: plugin writes `decisions` and `verdict_cache`; sidecar writes `reputation`, `autopsy_cache`, `claims`. No table has two writers, so WAL contention is theoretical rather than real.

---

## 14. API surface (sidecar)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Container health |
| `GET` | `/api/context-curator/policy` | Resolved policy |
| `GET` | `/api/context-curator/decisions` | Recent decisions |
| `GET` | `/api/context-curator/decisions/:id` | One decision with chunks |
| `GET` | `/api/context-curator/reputation` | Source table |
| `POST` | `/api/context-curator/reputation/reset` | Reset a domain or all |
| `POST` | `/api/context-curator/feedback` | Record good/bad |
| `POST` | `/api/context-curator/autopsy` | Counterfactual proof |
| `POST` | `/api/context-curator/claims/score` | Per-claim freshness for text (sentence-split, Tavily evidence, cached) |
| `GET` | `/api/context-curator/claims/:hash` | Per-claim freshness |

Auth: a single `CC_ADMIN_TOKEN` env var, sent as `Authorization: Bearer`. The sidecar is never exposed publicly in the demo.

---

## 15. Failure modes

| Failure | Behaviour |
|---|---|
| Tavily relay down | Fall through to direct HTTP |
| Both transports down | `annotate`, mark `refresh_failed`, continue |
| Tavily rate-limited | Skip refresh, continue |
| Invalid policy | Refuse to start with a clear error |
| Tokenizer unavailable | `len(runes)/4`, recorded as `estimate` |
| Chunk parse fails | Leave the message untouched, record `unparsed` |
| Autopsy provider error | Return partial result with the error |
| SQLite locked | Retry once, then serve without persistence |
| Sidecar down | Gateway keeps serving; UI unavailable; plugin unaffected |
| Plugin panic | Recovered per hook; request continues uncurated |

---

## 16. Security

- No API keys in logs, decisions, or the UI.
- URLs redacted on routes marked sensitive.
- Domain deny-list enforced before any model call.
- Autopsy replays use the original virtual key's permissions.
- No request or response bodies persisted beyond the redacted request needed for replay.
- Sidecar bound to the container network, token-protected.
- `x-cc-bypass` only honoured for loopback calls from the sidecar.

---

## 17. Performance

| Stage | Budget |
|---|---|
| Segmentation + provenance | < 3 ms / 50 chunks |
| Scoring | < 2 ms |
| Clustering | < 2 ms |
| Selection | < 3 ms |
| Rewrite | < 2 ms |
| **Total, no refresh** | **< 15 ms p95** |
| Refresh | bounded by `timeout_ms`, ≤ `max_tavily_credits` calls |

Chunk text is referenced, not copied. The per-request working set is released at the end of `PostLLMHook`.

---

## 18. Testing

| Layer | Tests |
|---|---|
| Segmenter | Tool messages, context blocks, user prose, mixed |
| Provenance | URL parsing, multi-URL, hash stability, inferred vs known |
| Scorer | Golden values per component, weight changes |
| Policy | Table-driven allow/deny/mode/budget |
| Cluster | Duplicate collapse, ordering, representative choice |
| Selector | Budget, empty input, min-sources floor, determinism |
| Rewriter | Order, tool call IDs, source list, streaming flag |
| Hook flow | Memo hit on second attempt, non-chat passthrough, prose untouched |
| Retriever | Fallback order, timeout, all-fail degradation |
| Autopsy | Sentence alignment, influence math, cache |
| Reputation | Posterior updates, decay, reset, cross-app read |
| Container | Image builds, `/healthz` green, one command runs the demo |

Coverage target: ≥ 80% on `plugin/`, excluding generated code.

### TDD-Immutability Rule (FROZEN — DO NOT EDIT)

Wave 1 tests are written FIRST from the plan's task acceptance criteria at the
hardest difficulty (deny cases, dedup-drop, stale-drop, budget-degrade,
fallback memo, non-chat passthrough). Frozen test files carry a
`FROZEN — DO NOT EDIT` header. A failing frozen test blocks its task; only
non-test source files may change to achieve green. Test edits require a plan
amendment entry with a reason. `go test ./...` must be non-vacuous (at least
one `*_test.go` per new source file) before any Wave 1 commit; the ledger
records red → green per task.

---

## 19. Repository layout

```
context-curator/
├── Dockerfile                     # multi-stage: bifrost dynamic + plugin .so + sidecar + UI
├── docker-entrypoint.sh
├── supervisord.conf
├── config/
│   ├── bifrost.json               # providers, relays, plugin registration
│   └── contextcurator.yaml        # policy
├── plugin/                        # Go module: github.com/<user>/context-curator/plugin
│   ├── go.mod                     # pins maximhq/bifrost/core
│   ├── main.go
│   ├── config.go
│   ├── segmenter.go
│   ├── provenance.go
│   ├── tokens.go
│   ├── scorer.go
│   ├── policy.go
│   ├── cluster.go
│   ├── selector.go
│   ├── rewriter.go
│   ├── recorder.go
│   ├── freshness.go
│   ├── reputation.go
│   ├── retriever/
│   │   ├── chain.go
│   │   ├── relay.go
│   │   └── http.go
│   ├── store/
│   │   └── sqlite.go
│   ├── testdata/
│   └── *_test.go
├── sidecar/                       # Go module
│   ├── go.mod
│   ├── main.go
│   ├── autopsy.go
│   ├── replayer.go
│   ├── diff.go
│   ├── claims.go
│   ├── api.go
│   ├── store.go
│   └── *_test.go
├── web/                           # Vite + React + Tailwind
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── pages/Requests.tsx
│       ├── pages/Sources.tsx
│       ├── components/DecisionDrawer.tsx
│       ├── components/AutopsyPanel.tsx
│       └── components/SentenceDiff.tsx
├── examples/
│   ├── apps/
│   │   ├── support/main.go
│   │   ├── docs/main.go
│   │   └── research/main.go
│   ├── seed/pages/*.md
│   └── eval/
│       ├── questions.jsonl
│       ├── main.go
│       └── results.md
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── VERIFICATION.md
│   ├── SETUP.md
│   ├── SUBMISSION.md
│   └── superpowers/{specs,plans}/
└── README.md
```

---

## 20. Container build

```dockerfile
# ---- stage 1: everything Go, one toolchain ----
FROM golang:1.24-bookworm AS gobuild
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /src/bifrost
COPY upstream/bifrost/ ./
RUN make build DYNAMIC=1
WORKDIR /src/plugin
COPY plugin/ ./
RUN go build -buildmode=plugin -o /out/contextcurator.so .

# ---- stage 2: UI ----
FROM node:22-bookworm AS uibuild
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- stage 3: runtime, same libc as builder ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates supervisor curl && rm -rf /var/lib/apt/lists/*
COPY --from=gobuild /src/bifrost/tmp/bifrost-http /usr/local/bin/
COPY --from=gobuild /out/contextcurator.so /usr/local/lib/
COPY --from=uibuild /web/dist /srv/web
COPY --from=gobuild /src/sidecar /usr/local/bin/cc-sidecar
COPY config/ /etc/context-curator/
COPY supervisord.conf /etc/supervisor/conf.d/
EXPOSE 8080 8090
HEALTHCHECK CMD curl -fsS http://127.0.0.1:8090/healthz || exit 1
ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
```

Same base libc in builder and runtime (`bookworm` both sides) removes the musl/glibc class of failure entirely. Image size is larger than Alpine; reliability is worth more than 40 MB on a hackathon deadline.

**Windows / WSL notes**

- Build and run through Docker Desktop's WSL2 backend. The Go plugin system never sees Windows.
- `.gitattributes` with `* text=auto eol=lf` so shell scripts and `supervisord.conf` do not arrive with CRLF.
- Do not bind-mount the repo into the container for the demo; copy it. Bind mounts across the WSL boundary are slow and mangle file modes.
- Keep the SQLite file on a named volume (`cc-data`), not on `/mnt/c`.

---

## 21. Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Fork Bifrost | Not a standard installation; 6k-line diff; sync cost |
| `PreLLMHook` rewrite | Per-attempt; not committed; would need a memo to avoid double Tavily spend |
| Handlers inside Bifrost | Plugins cannot register routes |
| Multi-container compose | User requirement: one container, one command |
| Sidecar as a separate product | Splits the demo across two commands |
| LLM-ranked curation | Unexplainable, costly, the pattern judges distrust |
| Pure compression | Crowded; no policy, no proof, no accountability |
| Static binary + no plugin | Impossible; static builds cannot load plugins |

---

## 22. Open items resolved at Wave 0

1. Exact Go toolchain version from Bifrost's `go.mod`. → **`go 1.27.3`** (`core/go.mod`, `transports/go.mod`).
2. Whether `make build DYNAMIC=1` succeeds unmodified on `bookworm`. → **Resolved: we do not call
   `make build`.** It depends on `build-ui`, which needs node. We invoke the dynamic branch directly.
3. Whether the relay path `/relay/<name>/search` exists in the current release. → **Yes**,
   `handlers/relaygateway.go:17-18`.
4. Whether `resp.ExtraFields` is preserved through the HTTP transport to the client. → **Moot**: the
   struct has no generic map, so decisions go to SQLite and correlate via `x-cc-decision-id`.
5. Whether the rewrite reaches the provider and survives fallbacks. → **Yes by source**
   (`core/bifrost.go:9827-9856`); proven empirically in Task 0.3.

Item 5 is the load-bearing assumption and is proven in Task 0.3 before any product code is written.
