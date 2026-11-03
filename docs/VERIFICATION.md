# Verification Report — Context Curator

**Date:** 2026-11-03
**Method:** SearXNG (Exa-backed) web/tech search, GitHub code + issue + repo search, Firecrawl scrape of live Bifrost docs, direct issue read.
**Verdict:** Idea survives. Architecture does not. Three corrections required before any code.

---

## 0. Verdict in one paragraph

The problem is real and the framing is sharp. The *concept* is not novel — at least eight recent repos do deterministic authority/freshness gating on retrieved context. The *placement* is novel: none of them is a Bifrost plugin, and none enforces the same source policy across every app behind a gateway. That is a defensible wedge, but it is a wedge of position, not of invention, and the pitch must say so. Three architecture assumptions in the current plan are wrong and one is a hard constraint. Fix them and this is a strong submission. Leave them and Wave 4 collapses on day 7.

---

## 1. Correction A — the fork is not required

**What the plan said:** stock Bifrost is statically linked, `.so` plugins fail, therefore fork `maximhq/bifrost` and compile the plugin in.

**What the docs actually say** (`docs.getbifrost.ai/plugins/getting-started`, scraped 2026-11-03):

> "Dynamic plugins require dynamic builds of Bifrost which are not enabled by default to keep Bifrost setup easier. If you want to build and try custom plugins on OSS read building dynamically linked Bifrost binary."

And (`/plugins/building-dynamic-binary`):

> "Go's plugin system requires **dynamic linking** to load `.so` files at runtime. By default, Bifrost builds are **statically linked**... However, statically linked binaries **cannot load Go plugins**. To use custom plugins with Bifrost, you must build a dynamically linked binary."

The documented command is `make build DYNAMIC=1`, which:
- removes `-extldflags "-static"`
- removes the `sqlite_static` build tag
- keeps `CGO_ENABLED=1`

Complete Dockerfiles for Alpine (musl) and glibc are published in that doc page.

**Issue #2586 is narrower than assumed.** Title: *"[Feature]: Build docker image with dynamic linking"*. State: **open**, created 2026-04-09, 9 comments, 6 👍. Body: *"Docker image built using `Makefile` always uses static linking — it can't be used with custom plugins. Add logic to apply DYNAMIC environment variable parameter to make docker-image command."* It is a build-tooling gap, not a statement that plugins don't work.

**Consequence:** a standalone repo with a Go-module plugin is fully supported, documented, and **more compliant** with the track's "work with a standard Bifrost installation" requirement than a fork. A fork means you are not running standard Bifrost.

**New repo shape:**

```
context-curator/                 # standalone, no fork
├── plugin/                      # Go module: github.com/<you>/context-curator/plugin
│   ├── go.mod                   # requires github.com/maximhq/bifrost/core
│   ├── main.go                  # exports Init/GetName/PreLLMHook/PostLLMHook/Cleanup
│   ├── segmenter.go ...
│   └── *_test.go
├── sidecar/                     # autopsy + reputation + policy API
├── web/                         # React UI
├── examples/                    # docker-compose, seed corpus, 3 apps, eval
└── docs/
```

**Upstream PR shape improves too:** a single new directory under `plugins/`, matching how `plugins/routing` and `plugins/semanticcache` are versioned as independent modules (`plugins/routing/v1.2.4`, `plugins/semanticcache/v1.7.4`). No 6,000-line fork diff.

---

## 2. Correction B — `PreRequestHook` is the wrong hook

**What the plan said:** mutate `req.Input` in `PreRequestHook`; it runs once and mutations survive fallbacks.

**What the docs actually say** (`/architecture/core/plugins`):

> "**PreRequestHooks** (per-request, registration order 1 → 2 → N): the **routing phase**. Plugins decide which provider/model the request goes to. Mutations to `req.Provider`/`req.Model`/`req.Fallbacks` commit to the shared request and are observed by every subsequent phase and every fallback attempt. There is no short-circuit."

The "mutations survive fallbacks" guarantee is documented for **Provider / Model / Fallbacks only** — not for message content.

> "**PreLLMHooks** (per attempt, registration order 1 → 2 → N): pre-call transforms — caching, validation, **content modification**. May short-circuit with a synthetic response."

Content modification is explicitly `PreLLMHook`'s job. Using `PreRequestHook` for it is unsupported behaviour that may be silently overwritten by core.

**The real trade-off:**

| | `PreRequestHook` | `PreLLMHook` |
|---|---|---|
| Runs | Once per request | Once per provider attempt (re-runs on fallback) |
| Documented for | Routing | Content modification |
| Fallback behaviour | Provider/model mutations commit | Re-runs → would re-spend Tavily credits |

**Fix — split the work across both hooks:**

```
PreRequestHook  → resolve policy, reserve credit budget, stash policy on ctx
PreLLMHook      → if decision memo exists on ctx, re-apply rewrite (0 cost)
                  else run pipeline, store decision + rewritten payload on ctx
PostLLMHook     → attach decision to resp.ExtraFields
```

`BifrostContext` persists across attempts within one request, so the memo is the natural mechanism. This is strictly better than the original plan: the credit budget is now enforced at the request level, which is what the PRD actually claimed.

---

## 3. Constraint C — a `.so` plugin cannot register HTTP routes

**Checked:** the documented plugin interface is `Init`, `GetName`, `HTTPTransportPreAuthHook`, `HTTPTransportPreHook`, `HTTPTransportPostHook`, `HTTPTransportResponseHeadersHook`, `HTTPTransportStreamChunkHook`, `PreRequestHook`, `PreLLMHook`, `PostLLMHook`, `Cleanup`. There is no route-registration method. `/api/plugins` is for *managing* plugins, not for plugins exposing endpoints.

**Consequence:** `POST /api/context-curator/autopsy`, `/reputation`, `/feedback`, `/decisions` cannot exist as Bifrost routes from a plugin.

**Options:**

| Option | Cost | Effect on the demo |
|---|---|---|
| **A. Sidecar** (small Go service, shared SQLite) | Low | Autopsy works. UI is a separate app. Plugin stays pure. |
| **B. Fork the HTTP transport** | High | Endpoints live in Bifrost. Breaks "standard installation". |
| **C. Drop autopsy, ship decision records only** | None | Kills the single best demo beat. Not acceptable. |

**Recommendation: A.** The plugin writes decisions into `ExtraFields` and SQLite; the sidecar serves autopsy/reputation/policy; the React app talks to the sidecar and to Bifrost's logs API. Three containers, one compose file. Honest, and each piece is small.

This also resolves the UI question: the drawer and page live in **our** app, not inside Bifrost's React bundle. That is a scope *reduction*, not an expansion — no fork of `ui/`, no Radix archaeology, no upstream UI conventions to learn.

---

## 4. Prior-art audit

Searched GitHub code, GitHub repos, and the open web. Scored on: does it do deterministic context admission, does it live in a gateway, does it learn across apps.

| System | What it does | Overlap | Gateway? | Cross-app? |
|---|---|---|---|---|
| `rmcmurrer81/context-gate` | Deterministic source authority, `ALLOW`/`REVIEW`/`BLOCK`, decision receipts | **High** — authority + determinism + receipts | No | No |
| `Open-AGS/attestor` | Pre-execution gate: policy, authority, scope, freshness, replay → `admit`/`narrow`/`review`/`block` | **High** — same verb set | No | No |
| `mobius-style/rcgov` | Non-compensatory gates before scoring; provenance and authority are hard gates | **High** — same ordering insight | No | No |
| `sparkplug604/praxis` | Ranks context by relevance, source state, freshness, trust, graph signals | Medium | No | No |
| `Emmimal/temporal-rag` | Validity filter, kind classifier, decay scorer, relevance gate | Medium | No | No |
| `emtcmca/transparent-confidence` | Deterministic auditable confidence scorecard for RAG | Medium | No | No |
| `remten341/rag-freshness-gating` | Half-life per datatype, freshness gating on RRF score | Medium | No | No |
| `PrinceGabriel-lgtm/freshcontext-mcp` | Freshness + source profile evaluation as MCP | Medium | No | No |
| Bifrost PR #4053 | OpenAI context **compaction** endpoint | Low — compaction ≠ admission | **Yes** | No |
| Bifrost `governance` plugin | Budgets, rate limits, virtual keys | Low — money, not sources | **Yes** | Partly |

**Honest reading:** the *mechanism* is a known pattern in late 2026. Several of these repos look recently generated and have no traction, but a judge who searches will find them. Claiming novelty for "deterministic context scoring" is not defensible.

**What is actually defensible, in order of strength:**

1. **Nobody has put it in a gateway.** All eight are app-side libraries or RAG-pipeline stages. Being in the request path means every app inherits the policy without changing code. That is a real, structural difference — and it is the thing Bifrost's own positioning ("one gateway in front of everything") makes possible.
2. **Cross-app source reputation.** One app's feedback changes another app's admissions. No prior art found. Also the hardest to demo convincingly.
3. **Causal proof via ablation.** No prior art found. Strongest *demo* asset, weakest *product* asset.

**Implication for the pitch:** lead with placement and proof. Never claim the scoring is new.

---

## 5. Rubric risk — "Use of AI" is a scored criterion

The hackathon judges on: **Innovation, Technical execution, Problem and potential impact, Use of AI, User experience, Scalability and potential.**

The plan's central credibility claim is *"there is no LLM in the decision path."* That is excellent engineering and a **direct negative** on one sixth of the rubric.

**Fix, without weakening the claim:**

- Frame Tavily as the AI-native retrieval layer it is (semantic search + extraction, not scraping).
- Add **LLM claim extraction** as an off-path, cached, best-effort step: split a chunk into atomic claims, attribute each to a source, score each claim's freshness. This is the literal ask of the Tavily theme and it adds visible AI to the pipeline without putting a model in the admission decision.
- The autopsy already uses a model for sentence attribution — make that visible, not incidental.

**One sentence for the deck:** *"Deterministic where trust is decided, AI where language is understood."*

---

## 6. Why this could fail — ranked

| # | Failure | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| 1 | **The model answers correctly anyway.** Demo's whole premise is that bad context produces a wrong answer. If the model is robust, the before/after shows nothing. | High | Fatal | Scripted mock provider for the failure beat. Seed a corpus where the wrong answer is genuinely the best-supported one. |
| 2 | **Autopsy returns influence ≈ 0.** "It wasn't the model, it was chunk 7" requires chunk 7 to actually change the output. Non-deterministic. | High | Fatal | Pick the ablation target by running the eval first and choosing a chunk with measured influence. Pre-compute the demo's autopsy, then reproduce it live. |
| 3 | **Scope.** 7 waves, 30 tasks, 3 apps, eval harness, video, deck — solo, 12 days. | High | High | Cut to 4 waves. See §8. |
| 4 | **Judges see a known pattern.** "This is context reranking with extra steps." | Medium | High | Lead with gateway placement + ablation proof, never with scoring. |
| 5 | **Tavily integration looks bolted on.** It's a checkbox for a second track. | Medium | Medium | Make freshness gating depend on Tavily `max_age_hours`; make the credit budget visible in the UI. |
| 6 | **The 40% number is soft.** Measured on a corpus you built to lose. | Medium | Medium | Publish the corpus and the harness. Say "on this corpus" every time. |
| 7 | **Plugin API drift.** Bifrost is at v2.4.x; plugin interfaces changed at v1.4, v1.6, v2.0. | Medium | Medium | Pin the core version in `go.mod`. Spike the interface in Wave 0 before anything else. |
| 8 | **Dynamic build friction.** `DYNAMIC=1` + libc matching + Go version matching is a setup step that can eat a day. | Medium | Medium | Use the published Alpine Dockerfile verbatim. Never build on Windows. |

---

## 7. The economics, stated plainly

- **Cash prize pool: $1,000 total**, shared across every track.
- Tavily credits: $65 × 100 winners. Omnidimension: $50 × 100.
- **1,618 registrations**, 13 days left at time of writing.
- Submission closes **15 Nov 2026, 23:59**. Judging **29 Nov**.

Expected cash value is close to zero. The real return is the upstream PR, the repo, and the video. Optimise for **a thing that looks excellent in 90 seconds and is obviously a real contribution** — not for prize maximisation.

This argues for cutting scope aggressively and polishing three artefacts: the eval table, the autopsy, and the README.

---

## 8. Time budget reality

12 working days, solo, and the plan allocates 12. Zero slack for: the dynamic-build setup, the plugin-interface spike, an LLM provider outage, or a bad demo take.

**Proposed cut to four waves:**

| Wave | Days | Content | Why it survives |
|---|---|---|---|
| **0 — Spike** | 1 | `DYNAMIC=1` build + `.so` load + one hook that logs. Prove the interface. | If this fails, everything else is fiction. |
| **1 — Admission** | 3 | Segment → provenance → score → policy → select → rewrite, with reason codes. | The product. |
| **2 — Proof** | 3 | Sidecar + SQLite + autopsy + sentence diff. | The demo. |
| **3 — Evidence** | 3 | 3 apps, seed corpus, eval harness, measured table, video, deck, README. | The submission. |
| **4 — Polish** | 2 | Buffer. Tavily refresh, credit budget, UI drawer. | Absorbs slippage. |

**Explicitly cut from v1:**
- Cross-app learned reputation (Wave 5). It is the least demo-able idea in the plan and the most likely to read as a gimmick. Keep the schema, ship it as "roadmap".
- MCP transport. Relay + HTTP covers the story; MCP is a third code path with its own failure modes.
- The standalone Context page. Drawer only.
- Policy editor.

**Kept because they carry the submission:** reason codes on every drop, the autopsy, the measured eval table, the 3-app demo.

---

## 9. What is actually good about this

Not everything survives criticism. These hold up:

1. **The one-liner is genuinely strong.** *"Compression asks how few tokens. We ask which sources are allowed to speak."* It is memorable, true of the product, and distinguishes it from every compressor.
2. **The reason-code discipline is real engineering.** Every drop is explainable. That is what separates this from a heuristic in a trench coat.
3. **The autopsy is a genuine idea.** Ablation as a product feature, not a research method. Nobody in the prior-art set does it.
4. **Gateway placement is structurally correct.** Fixing context per-app is a losing game; fixing it once is the only version that scales. Bifrost is the right host.
5. **The demo has a spine.** Bill → drop → proof → fleet. That is a story, not a feature list.

---

## 10. Decisions required

1. **Architecture:** accept the three corrections (no fork, `PreLLMHook` + memo, sidecar)? Without them the plan is unbuildable as written.
2. **Scope:** accept the four-wave cut, dropping cross-app learning and MCP from v1?
3. **Pitch:** reframe from cost to trust ("which sources are allowed to speak") with cost as a measured side effect?
4. **AI surface:** add off-path LLM claim extraction to satisfy the "Use of AI" criterion and to hit the Tavily theme literally?

---

## Appendix — sources

- `https://docs.getbifrost.ai/plugins/getting-started` — plugin interface, `.so` architecture, platform limits
- `https://docs.getbifrost.ai/plugins/building-dynamic-binary` — `DYNAMIC=1`, Dockerfiles, libc matching
- `https://docs.getbifrost.ai/architecture/core/plugins` — hook ordering, PreRequestHook vs PreLLMHook semantics
- `https://docs.getbifrost.ai/migration-guides/v2.0.0` — v2 hook changes
- `https://github.com/maximhq/bifrost/issues/2586` — Docker image dynamic linking (open)
- `https://github.com/maximhq/bifrost/pull/4053` — OpenAI compaction support
- `https://github.com/maximhq/bifrost/blob/main/transports/bifrost-http/server/plugins.go` — plugin registry
- `https://github.com/twsl/bifrost-plugins` — third-party plugin examples (Go module layout)
- `https://github.com/datamathcode/bifrost-plugin-development` — `.so` reference implementation
- Prior art: `rmcmurrer81/context-gate`, `Open-AGS/attestor`, `mobius-style/rcgov`, `sparkplug604/praxis`, `Emmimal/temporal-rag`, `emtcmca/transparent-confidence`, `remten341/rag-freshness-gating`, `PrinceGabriel-lgtm/freshcontext-mcp`
