# Deck outline — Context Curator

All numbers from `examples/eval/results.md` (50 questions x 3 repeats, deterministic echo mock; accuracy = 1 when the answer contains every required token and none of the banned ones).

## 1. Problem

- Agents assemble answers from search, tools, and memory; the gateway forwards everything without opinion.
- Trust: stale blogs, competitor marketing, and vendor docs arrive as equal evidence.
- Cost: the same page sent repeatedly, plus duplicates and low-value snippets.
- Accountability: logs show what was sent, not what mattered or whether it should have been admitted.
- Existing tools solve one slice (compressors shrink, rerankers reorder, RAG filters at retrieval); none enforces one source policy in the gateway request path.

## 2. Demo still

- Request drawer freeze-frame: 14 chunks in, 5 kept, 9 dropped with reason codes (`stale`, `authority_denied`, `duplicate_of`, `low_relevance`, `over_budget`).
- Hero beat: "How much is Pro?" — stale $39 refused, current $49 kept, answer flips wrong -> right.

## 3. Architecture

- One container, three processes: `bifrost-http :8080` (stock source, dynamic build) loading `contextcurator.so` via `plugin.Open()`; `cc-sidecar :8090` (UI + API); shared SQLite at `/data/contextcurator.db`.
- Pipeline runs once per request in `PreRequestHook`: resolve policy (virtual key -> route -> default) -> segment tool/` <context>` chunks -> provenance -> hard deny -> score (0.35 relevance + 0.20 authority + 0.20 freshness + 0.15 independence + 0.10 utility) -> Tavily refresh within credit budget -> cluster near-duplicates -> MMR select -> rewrite `ChatRequest.Input` -> stash decision; `PostLLMHook` persists the decision; response carries `x-cc-decision-id`.
- Decision path contains no LLM. Deterministic: same input + policy + reputation = same decision.

## 4. Measured results

| | raw (`annotate`) | curated (`rewrite`) |
|---|---|---|
| mean accuracy | 0.480 | **1.000** (+52pp) |
| mean provider tokens | 416 | **366** (-12.0%) |
| mean latency | 8 ms | 8 ms |

- Traps covered: stale prices ($39 refused, $49 kept), denied domains, near-duplicate press releases collapsed to one chunk, version/law controls.
- Latency overhead within noise on the echo mock; no-refresh p95 target < 15 ms per PRD.
- 100% of dropped chunks carry a reason code.

## 5. Bifrost fit (primary theme)

- Supported extension points only: `Init`, `GetName`, `PreRequestHook`, `PostLLMHook`, `HTTPTransportResponseHeadersHook`, `Cleanup`; no fork, no core modification.
- Standard installation: stock Bifrost source built with dynamic linking; plugin compiled in the same Docker stage with the same toolchain; absolute plugin path.
- Contribution shape: one new directory under `plugins/` (mirrors `plugins/routing`), plus docs, setup, and tests — suitable as an upstream PR.
- Setup: one `docker run -p 8080:8080 -p 8090:8090` with `OPENAI_API_KEY` / `TAVILY_API_KEY`; `go test ./...` passes in `plugin/` and `sidecar/`.

## 6. Tavily fit (secondary theme)

- Pre-emptive form of the theme: refuses stale sources *before* generation instead of flagging claims after.
- Live check via `search` with `max_age_hours` per freshness class (price 24 h, version 720 h, law 168 h, static 8760 h) plus `extract` on the authoritative page; verdicts cached by content hash.
- Per-chunk freshness score in the decision record; per-claim freshness (FR-9) computed off-path in the sidecar and shown as claim badges.
- Credit budget reserved per request and never exceeded; any transport failure degrades to `annotate` with `refresh_failed` — never blocks.

## 7. PR shape

- `plugins/context-curator/`: plugin source + tests + config schema + README section.
- Sidecar + web UI served from the sidecar (Go plugins cannot register HTTP routes).
- Evidence included: seed corpus, 50-question eval harness, `examples/eval/results.md`, video (5 acts, 85 s), this deck.
