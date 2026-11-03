# Context Curator — Design

**Date:** 2026-11-03
**Author:** Athmabhiram S J
**Status:** SUPERSEDED by `docs/PRD.md` + `docs/ARCHITECTURE.md` (rev. 2) + `docs/VERIFICATION.md`
**Working name:** Context Curator (locked)

> This document captured the original design. Verification against live Bifrost docs changed three things: no fork (`.so` plugin instead), `PreLLMHook` instead of `PreRequestHook` for content rewriting, and a sidecar because plugins cannot register HTTP routes. Read `docs/ARCHITECTURE.md` for the current design. Kept for the reasoning trail.

---

## 1. Intent

Agents retrieve far more context than they need, from sources of unequal authority and freshness, and the gateway forwards all of it. The result is higher cost, worse answers, and no way to say which sources were allowed to influence an output.

Context Curator is a built-in Bifrost plugin that performs **admission control on context** before the model sees it. It decides which chunks are allowed to speak, records why, and proves the decision changed the answer.

The one-line position:

> Compression asks how few tokens. We ask which sources are allowed to speak.

This is not a wrapper around an API. It changes the request path inside the gateway, which is the only place that sees every app's traffic and can enforce the same policy everywhere.

---

## 2. Goals

1. Reduce input tokens and cost on context-heavy agent requests without reducing answer quality.
2. Enforce per-route policy on source authority, freshness, independence, and budget.
3. Make every keep/drop decision explainable and reproducible, with no LLM judge in the decision path.
4. Prove causality on demand: show that a specific dropped chunk caused a specific wrong sentence.
5. Learn source utility across apps, so a new app benefits from traffic it never sent.
6. Ship as a PR-shaped built-in plugin: setup docs, tests, and no changes to the public API.

## 3. Non-goals

- Not a general-purpose RAG framework.
- Not a summarizer of user input. User-authored text is never rewritten.
- Not a factual verification system. It does not decide whether a claim is true; it decides whether a source is admissible.
- Not a hosted service. Everything runs in-process in Bifrost.
- Not a replacement for provider prompt caching. It runs before it and improves what gets cached.

## 4. Anti-goals

- A demo that needs a voiceover to explain why a number matters.
- A chat window with a spinner.
- An LLM judging another LLM and calling it rigor.
- Anything that only works with a custom SDK or a forked client.

---

## 5. Constraints

- **Deadline:** 15 Nov 2026, hard. Solo build.
- **Bifrost plugins:** stock builds are statically linked and cannot load `.so` plugins (issue #2586). Therefore the plugin ships **built-in inside a fork**, registered in `transports/bifrost-http/server/plugins.go`. This is also the natural upstream PR shape.
- **Hook semantics:** `PreRequestHook` runs once per top-level request, and mutations to `req.Input` are committed and observed by every fallback attempt. This is the correct place for context rewriting.
- **Streaming:** curation happens before the provider call, so streaming is unaffected. This is deliberate and removes the hardest risk from verification-style designs.
- **Tavily:** 1,000 free credits/month; `max_age_hours` is a supported search parameter (0–720). Budget must be enforced per request.
- **Demo:** mix of real providers and a mock provider. Real Tavily key available.

---

## 6. Approaches considered

### 6.1 Compression vs admission

| Approach | Trade-off |
|---|---|
| Compress text (LLMLingua-style) | Cheap to add, but a crowded product category (Compresr, Contextwaise, Headroom) and unexplainable when it drops the wrong clause. |
| **Admission control (chosen)** | Decides at the source level, so every decision maps to a URL, an age, or a policy rule. Token savings follow. Defensible and auditable. |

### 6.2 Decision engine

| Approach | Trade-off |
|---|---|
| LLM-ranked | Best nuance, but costly, slow, unexplainable, and exactly the pattern judges distrust. |
| **Deterministic scoring + MMR (chosen)** | Fast, reproducible, testable, no model in the loop. Weights are tunable and visible. |
| Hybrid with LLM tie-break | Extra quality on ambiguous chunks; adds latency and a second model call. Deferred. |

### 6.3 Hook point

| Hook | Trade-off |
|---|---|
| **`PreRequestHook` (chosen)** | Once per request, committed mutations, stable across fallbacks. |
| `PreLLMHook` | Per attempt; risks re-curating on failover and double-counting budget. |
| Transport hook | Lowest level; duplicates request parsing and provider normalization. |

### 6.4 Tavily transport

A `Retriever` interface with three implementations, tried in a configured order:

1. **Relay** — Tavily through Bifrost's own `/relay/{name}/...` route. Governed, priced, logged. Preferred.
2. **MCP** — Tavily through Bifrost's MCP gateway. Useful when the relay is not configured.
3. **Direct HTTP** — plugin calls Tavily with an environment key. Fallback only.

The chain is configurable so a failure in one path does not stop curation.

### 6.5 Where evidence is stored

- Per-request decisions: Bifrost log metadata (extra fields), so the existing request detail view can render them.
- Cross-request state (source reputation, cached verdicts): a small SQLite table owned by the plugin, with a configurable path.

---

## 7. Architecture

```
client → HTTPTransport → PreRequestHook (curator) → provider
                              │
                              ├─ chunk + provenance
                              ├─ score + policy
                              ├─ Tavily refresh (only if stale)
                              ├─ select under budget (MMR)
                              └─ rewrite req.Input, record decision
                                                     │
                                        PostLLMHook ──┘ → log metadata
```

Components:

1. **Segmenter** — splits context into addressable chunks with provenance.
2. **Scorer** — authority, freshness, relevance, independence, learned utility.
3. **Policy engine** — per virtual key / route rules and budgets.
4. **Refresher** — Tavily search/extract when a chunk is stale or a required source is missing.
5. **Selector** — maximal marginal relevance under a token budget.
6. **Rewriter** — rebuilds `req.Input` with kept chunks and a citation block.
7. **Recorder** — writes decisions to log metadata and the plugin store.
8. **Autopsy** — on-demand counterfactual replay proving influence.
9. **Learner** — updates per-domain utility from feedback and corrections.

---

## 8. Request flow

1. Request arrives. Resolve policy from virtual key, route, and model.
2. Segment candidate context. In v1 this means:
   - `role: tool` messages,
   - explicit `<context>...</context>` or fenced retrieval blocks,
   - retrieved-document arrays when the provider request carries them.
   User-authored prose is never segmented or rewritten.
3. For each chunk, compute provenance: URL, domain, fetch time, content hash, tool call ID.
4. Score every chunk. Drop hard denials immediately (deny list, policy violation).
5. If a chunk is older than its class limit and the policy requires freshness, refresh it through the Retriever chain. Recompute the hash and score.
6. Cluster near-duplicates (SimHash bands, Jaccard ≥ threshold). Keep one representative per cluster.
7. Select under budget with MMR, penalizing redundancy and rewarding authority, freshness, independence, and learned utility.
8. Rewrite the request: keep selected chunks in their original order, append a compact source list, and annotate the request with a curator header for downstream plugins.
9. Record the decision. On response, attach the same record to log metadata.
10. If mode is `block` and a required-primary rule is violated, short-circuit with a structured error that names the missing source class.

---

## 9. Data model

### Chunk

```json
{
  "id": "c7",
  "tool_call_id": "call_abc",
  "source_url": "https://example.com/pricing",
  "domain": "example.com",
  "fetched_at": "2026-09-02T10:11:00Z",
  "content_hash": "sha256:...",
  "tokens": 412,
  "authority_tier": "aggregator",
  "freshness_class": "price",
  "cluster_id": "simhash:9f2a",
  "relevance": 0.71,
  "freshness": 0.12,
  "independence": 0.33,
  "utility": 0.48,
  "score": 0.39
}
```

### Decision record

```json
{
  "policy": "support-bot",
  "mode": "rewrite",
  "chunks_in": 14,
  "chunks_kept": 5,
  "tokens_in": 12043,
  "tokens_out": 2841,
  "freshness_score": 0.82,
  "independent_sources": 2,
  "tavily_credits": 1,
  "dropped": [
    {"id": "c7", "reason": "stale", "age_hours": 1464},
    {"id": "c9", "reason": "duplicate_of:c4"},
    {"id": "c11", "reason": "authority_denied"}
  ]
}
```

### Source reputation

```json
{
  "domain": "example.com",
  "alpha": 7.0,
  "beta": 2.0,
  "utility": 0.78,
  "last_seen": "2026-11-02T18:00:00Z",
  "denied": false
}
```

---

## 10. Scoring

```
score = 0.35 * relevance
      + 0.20 * authority
      + 0.20 * freshness
      + 0.15 * independence
      + 0.10 * utility
```

- **relevance:** BM25 over query terms in v1; optional embedding similarity if the vector store is configured.
- **authority:** tier weights — primary/official 1.0, reputable 0.8, aggregator 0.5, unknown 0.3, denied 0.0.
- **freshness:** `exp(-age_hours / half_life_hours(class))`.
- **independence:** `1 / cluster_size`.
- **utility:** Beta posterior mean per domain, starting at 0.5.

Selection uses MMR with `lambda = 0.7` against the already-selected set, under `max_context_tokens`.

Weights are configurable and printed in the decision record so a judge can see exactly why a chunk fell.

---

## 11. Policy schema

```yaml
context_curator:
  enabled: true
  mode: rewrite            # annotate | block | rewrite
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
    transport_order: [relay, mcp, http]
    search_depth: basic
    max_age_hours: 24
```

---

## 12. Causal proof (autopsy)

On demand, for a recorded request and a chunk:

1. Replay the original request with the chunk present.
2. Replay it with the chunk removed.
3. Align responses at sentence level and diff.
4. Report which sentences changed and by how much.

Output: `influence = changed_sentences / total_sentences`, plus a side-by-side diff.

This is the only place a second model call happens, and it is user-triggered, capped, and cached. It is not part of the serving path.

The demo uses it to prove that a specific stale chunk caused the wrong sentence.

---

## 13. Cross-app learning

Every domain carries a Beta(α, β) utility score.

Feedback sources:

- operator marks an answer good or bad,
- a correction event is recorded for the request,
- a chunk is kept and the answer later passes the route's policy check.

Updates are additive and bounded. A new app inherits the reputation table, so its first request already benefits from other apps' traffic. The demo shows this with a second app that has never seen a domain before.

---

## 14. UI

Two surfaces, both inside the existing Bifrost UI:

1. **Request detail drawer** — chunks in, chunks kept, reasons, tokens saved, freshness score, independent source count.
2. **Context page** — request table, source reputation table, policy summary, and an autopsy panel.

The drawer ships first because it is the demo's proof surface. The page ships second.

---

## 15. Demo plan

Three apps share one gateway and one curator: a pricing support bot, a docs assistant, and a company research agent.

**Act 1 — The bill (15s).** Raw run across 12 questions: tokens, dollars, accuracy.

**Act 2 — The drop (20s).** Replay one question. Fourteen chunks enter; nine fall away with reasons visible (stale 61d, duplicate of c4, aggregator, over budget). Five remain. The answer flips from wrong to right. Cost falls.

**Act 3 — The proof (15s).** Click the wrong sentence in the raw run. Autopsy removes one chunk; the sentence flips. "It wasn't the model. It was chunk 7."

**Act 4 — The fleet (10s).** The docs assistant, never configured, already drops a known-bad domain because the support bot taught the reputation table.

**Act 5 — The control (5s).** Policy panel: allowed domains, max age 24h, minimum two independent sources. Closing line: "Compression asks how few tokens. We ask which sources are allowed to speak."

Side-by-side panes for the pitch; animated single run for the technical deep dive.

---

## 16. Evaluation plan

- 50 questions with known answers across three domains (pricing, docs, company facts).
- Compare raw vs curated on: accuracy, input tokens, cost, latency, and independent sources per answer.
- Three repeats; report mean and spread.
- Publish the harness and the numbers in the README and the deck. No hand-waved claims.

---

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Chunk parsing differs across providers | Normalize in `PreRequestHook`; support tool messages and explicit context blocks first. |
| Token counting drift | Use Bifrost's tokenizer where available; fall back to a local counter and log the method. |
| Tavily latency | Refresh only stale chunks that policy requires; cache verdicts per content hash. |
| False drops hurt quality | `annotate` mode is the safe default for unknown routes; user prose is never touched. |
| UI eats the schedule | Drawer first, page second; the demo can run on the drawer alone. |
| Autopsy cost | On demand, capped at 5 ablations, cached. |
| Cross-app learning looks fake | Seed with real feedback events from the demo runs; show the posterior move. |

---

## 18. Twelve-day plan

| Day | Work |
|---|---|
| 1 | Fork, build, register a no-op plugin; verify it loads in the stock binary. |
| 2 | Segmenter + provenance extraction for tool messages and context blocks. |
| 3 | Scorer + policy engine + unit tests. |
| 4 | Tavily retriever chain (relay → MCP → HTTP) + freshness refresh. |
| 5 | Selector (MMR) + rewriter + log metadata. |
| 6 | Demo apps and the raw-vs-curated harness. |
| 7 | Autopsy endpoint + sentence diff. |
| 8 | Reputation table + learning updates. |
| 9 | UI drawer. |
| 10 | UI page + policy panel. |
| 11 | Eval run, numbers, README, setup docs. |
| 12 | Video, deck, submission. |

Two days of slack are not assumed; if a day slips, the UI page and the learning curve are the first cuts.

---

## 19. What is left to the builder

- Exact weight tuning and the authority tier list.
- Whether relevance uses BM25 only or an embedding model.
- The visual design of the drop animation.
- The benchmark question set.
- The final product name.

---

## 20. Prior art and positioning

Context compression and context gateways exist (Compresr, Contextwaise, FreshContext, LiteLLM Headroom). None of them are a gateway-native admission-control layer with per-key policy, causal proof, and cross-app source reputation. The pitch must lead with admission control and proof, not with token savings, or it will be read as another compressor.
