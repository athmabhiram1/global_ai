# PRD — Context Curator

**Product:** Context Curator
**Author:** Athmabhiram S J
**Date:** 2026-11-03 (rev. 2)
**Status:** Approved direction, pending build
**Deadline:** 15 Nov 2026, 23:59 — hard
**Team:** Solo
**Verification:** see `docs/VERIFICATION.md`

---

## 1. Summary

Context Curator is a Bifrost plugin that performs **admission control on the context an LLM is allowed to see**. It scores every retrieved chunk on authority, freshness, independence, relevance, and learned utility, keeps only what earns its place, and records why each rejected chunk was rejected. Any decision can be proven causally by replaying the request with one chunk removed.

**One line:** *Compression asks how few tokens. We ask which sources are allowed to speak.*

**Headline (trust, not cost):** *Your agent read a poisoned page, and the gateway had no opinion about it.*

---

## 2. The problem

Agents now assemble answers from web search, MCP tools, file reads, and memory. The gateway forwards all of it without comment. Three failures follow:

1. **Trust.** A stale blog post, a competitor's marketing page, and a vendor's own docs arrive as equal evidence. The model picks by volume and recency of position, not by authority. Nobody can say which sources were allowed to influence the answer.
2. **Cost.** The same page is sent repeatedly, alongside near-duplicate copies and low-value snippets. Input tokens dominate the bill for context-heavy agents.
3. **Accountability.** When an answer is wrong, logs show what was sent — not what mattered, or whether it should have been admitted at all.

Trust is the headline; cost is the measured side effect.

Existing tools solve one slice each: compressors shrink text, rerankers reorder it, RAG frameworks filter at retrieval time. None of them sit in the request path of a gateway and enforce one source policy across every app.

---

## 3. Users

| User | Job to be done | Pain today |
|---|---|---|
| **Platform engineer** | One policy for every agent's context | Each app reimplements retrieval hygiene, badly |
| **Security engineer** | Stop tool output from steering the model | No per-source policy exists at the gateway |
| **Agent developer** | Ship answers that use the right source | Debugs context by reading raw logs |
| **SRE** | Explain a bad answer after an incident | Logs show what was sent, not what mattered |

Primary buyer for the narrative: the platform engineer at a company running many agents behind one gateway.

---

## 4. Goals

1. Enforce per-virtual-key and per-route policy on source authority, freshness, independence, and token budget.
2. Record every keep/drop decision with a machine-readable reason code.
3. Prove causality on demand: show that a specific chunk caused a specific sentence.
4. Learn source utility across apps, so a new app inherits what the fleet already knows.
5. Cut input tokens and cost on context-heavy requests by ≥ 40% with no accuracy regression.
6. Ship as a supported Bifrost plugin: `.so`, documented build, tests, no fork.

## 5. Non-goals

- Not a RAG framework, vector database, or retriever.
- Not a fact-checker. It does not decide whether a claim is true.
- Not a summarizer of user-authored text.
- Not a hosted service.
- Not a replacement for provider prompt caching.
- Not a prompt-injection classifier. It gates *sources*, not *strings*.

## 6. Anti-goals

- A demo that needs narration to explain why a number matters.
- An LLM judging another LLM and calling it rigor.
- A wrapper that only works if the app changes its SDK.
- A dashboard with no before/after.
- A fork of Bifrost that nobody can install.

---

## 7. Track alignment

### Bifrost — primary

> *"Extend the open-source Bifrost gateway with a practical feature... must use supported extension points, work with a standard Bifrost installation, and include clear setup instructions, documentation, and tests. The final contribution should be suitable for consideration as an upstream open-source pull request."*

Context Curator is a **native Go `.so` plugin** using Bifrost's documented plugin system (`Init`, `GetName`, `PreRequestHook`, `PreLLMHook`, `PostLLMHook`, `Cleanup`). It requires no fork and no core modification. It ships with tests, a setup guide, and a config schema. The plugin directory is structured as an independent Go module, matching how `plugins/routing` and `plugins/semanticcache` are released upstream — so the PR shape is "add one directory under `plugins/`".

**Why not a fork:** a fork is not a standard Bifrost installation. The docs publish the dynamic-build path (`make build DYNAMIC=1`) and complete Dockerfiles specifically so custom plugins can load. That is the supported extension point.

### Tavily — secondary (merged)

> *"Detect potentially stale claims involving pricing, API versions, regulations, or company information, re-verify them against live web sources, and provide a freshness score for each claim."*

Context Curator is the **pre-emptive** form: it refuses to admit stale sources *before* generation rather than flagging claims after, and it emits a freshness score per retained source and per extracted claim. Tavily supplies the live check via `search` with `max_age_hours` and `extract` for the authoritative page.

The claim-level freshness score is a **v1 requirement**, not a stretch item. It is the literal ask of the theme and it is cheap once the chunk pipeline exists.

---

## 8. Why this is not AI slop

| Common submission | Context Curator |
|---|---|
| An app that calls Tavily | A change to the gateway's request path |
| Adds more context | Decides which context is admissible |
| Asks an LLM to judge | Deterministic scoring, explainable weights, published reason codes |
| Chat window demo | Same model, same question, before/after, measured |
| Claims savings | Publishes the eval harness and the corpus |
| A notebook | A `.so` plugin, a container, and a test suite |

The decision path contains no LLM. That is the credibility claim, and it is deliberately narrow: AI is used where language must be understood (claim extraction, sentence attribution), never where trust is decided.

---

## 9. User stories

1. As a security engineer, I deny a domain once and every app behind the gateway stops using it.
2. As a platform engineer, I set a policy so no pricing answer can cite a source older than 24 hours.
3. As an agent developer, I open a request and see 14 chunks in, 5 kept, and the reason each one fell.
4. As an SRE, I click a wrong sentence and see which chunk caused it, proven by removal.
5. As a developer onboarding a new app, I inherit source reputation learned from the other apps.
6. As a judge, I watch the same model produce a wrong answer and then a right one, with cost dropping and the policy visible.

---

## 10. Functional requirements

### FR-1 Segmentation
Identify candidate context from `role: tool` messages and explicit `<context>` blocks. Never rewrite user-authored prose. Assign every chunk a stable ID and provenance.

### FR-2 Provenance
Extract URL(s), domain, fetch time, content hash, tool call ID. Mark provenance `known` or `inferred`. Inferred chunks cannot be hard-dropped for authority.

### FR-3 Scoring
Compute relevance, authority, freshness, independence, utility. Publish the weighted score and every component in the decision record.

### FR-4 Policy
Modes: `annotate`, `block`, `rewrite`. Enforce max context tokens, max chunks, max Tavily credits, allowed/denied domains, minimum independent sources, required primary source classes. Resolve by virtual key → route → global default.

### FR-5 Freshness
Classify chunks into price, version, law, static. Compare age to the class limit. Refresh stale chunks through the Tavily chain using `max_age_hours`. Cache verdicts by content hash.

### FR-6 Selection
Cluster near-duplicates. Select under budget with maximal marginal relevance. Keep one representative per independent cluster when policy requires it.

### FR-7 Rewrite
Rebuild the request with kept chunks in original order. Append a compact source list with URLs and fetch times. Preserve tool call IDs, roles, and streaming flags.

### FR-8 Record
Write a decision record to response `ExtraFields`. Include counts, token deltas, credits spent, freshness score, and drop reasons.

### FR-9 Claim freshness (Tavily theme)
Extract atomic claims from retained chunks, attribute each to a source, assign a per-claim freshness score. Off the admission path, cached, best-effort.

### FR-10 Autopsy
Given a request ID and chunk ID, replay with and without the chunk. Diff responses at sentence level. Return influence score and side-by-side diff. Cap at 5 ablations per call; cache results.

### FR-11 Reputation (cross-app learning)
Maintain Beta(α, β) per domain. Update from explicit feedback and correction events. Expose read and reset APIs. One table shared by every app — no per-app silo.

### FR-12 UI
**Drawer:** chunks, reasons, token delta, freshness, independent sources.
**Page:** request table, source reputation, policy summary, autopsy panel.

### FR-13 Configuration
JSON config with schema validation. Sensible defaults; `annotate` for unknown routes.

---

## 11. Deployment requirement (hard)

**One Docker container.** One command to run, one image to share.

```bash
docker run -p 8080:8080 -p 8090:8090 \
  -e OPENAI_API_KEY=... -e TAVILY_API_KEY=... \
  ghcr.io/<user>/context-curator:latest
```

The image contains Bifrost (dynamically linked), the plugin `.so`, the sidecar, and the built UI. It starts all three under one entrypoint. No fork, no host Go toolchain, no `.so` compilation on the user's machine.

Windows/WSL is a first-class target: the image is built inside Linux, so Go's plugin system never touches Windows.

---

## 12. Non-functional requirements

| Requirement | Target |
|---|---|
| Added latency (no refresh) | < 15 ms p95 at 1k RPS |
| Added latency (one refresh) | < 900 ms p95, dominated by Tavily |
| Memory per 10k chunks | < 50 MB |
| Determinism | Same input + policy + reputation = same decision |
| Failure isolation | Tavily failure degrades to `annotate`, never blocks |
| Security | No secrets in logs; URLs redacted on sensitive routes |
| Compatibility | Stock Bifrost source, dynamic build, unmodified core |
| Test coverage | ≥ 80% on the decision engine; table-driven policy tests |
| Cold start | Container ready in < 10 s |

---

## 13. Success metrics

Measured by the eval harness, published in the README:

1. **Token reduction:** ≥ 40% mean input-token reduction on context-heavy requests.
2. **Accuracy:** ≤ 2 pp regression overall; target **+5 pp** on stale-source questions.
3. **Cost:** ≥ 40% mean cost reduction per answered question.
4. **Explainability:** 100% of dropped chunks carry a reason code.
5. **Latency:** p95 overhead < 15 ms with no refresh.
6. **Freshness:** ≥ 90% of retained sources inside the policy window.

Every number in the deck must come from `eval/results.md`.

---

## 14. Scope

### v1 (must ship)

**Plugin**
- Segmenter (tool messages + context blocks), provenance, token counter
- Scorer (5 components, published weights)
- Policy resolution and hard denies
- Near-duplicate clustering, MMR selection, rewriter
- Tavily freshness refresh via relay → direct HTTP, with credit budget
- Decision record with reason codes

**Sidecar**
- SQLite: reputation, verdict cache, autopsy cache
- Autopsy: replay, sentence diff, influence score
- Claim freshness scoring (FR-9)
- API: policy, reputation, feedback, autopsy, decisions
- Serves the built UI

**Learning**
- Beta reputation per domain, cross-app, feedback + decay

**Surface**
- Request drawer and Context page in our own React app

**Evidence**
- 3 demo apps, seed corpus, 50-question eval harness, measured table, video, deck, README

### Cut from v1

| Cut | Reason |
|---|---|
| MCP transport | Relay + HTTP cover the story; MCP is a third failure surface |
| Policy editor UI | Read-only policy display is enough for the demo |
| Embedding relevance | BM25 is deterministic and sufficient |
| Fork of Bifrost's UI | Our own app is smaller and does not couple us to upstream |

---

## 15. Demo narrative

Three apps share one gateway: a pricing support bot, a docs assistant, and a company research agent.

1. **The bill.** Raw run: tokens, dollars, accuracy.
2. **The drop.** Replay one question; nine of fourteen chunks fall with reasons; the answer flips from wrong to right; cost falls.
3. **The proof.** Click the wrong sentence; autopsy removes one chunk; the sentence flips. *"It wasn't the model. It was chunk 7."*
4. **The fleet.** The docs assistant, never configured, already drops a known-bad domain learned from the support bot.
5. **The control.** Policy panel: denied domains, 24h max age, two independent sources.

Closing line: *"Compression asks how few tokens. We ask which sources are allowed to speak."*

Total runtime: under 90 seconds, no narration required.

---

## 16. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Model answers correctly despite bad context** | Fatal to the demo | Scripted mock provider for the failure beat; seed a corpus where the wrong answer is best-supported |
| **Autopsy influence ≈ 0** | Fatal to the demo | Pre-compute influence in the eval, pick the ablation target, then reproduce live |
| Scope, solo, 12 days | High | 5 waves with an explicit cut line; MCP and policy editor already cut |
| Judges recognise the pattern | High | Lead with gateway placement and ablation proof, never with scoring novelty |
| Tavily latency | Medium | Refresh only stale chunks; cache by hash; 900 ms timeout |
| False drops hurt quality | High | `annotate` default; never drop user prose; eval gate |
| Go plugin build mismatch | Medium | Build Bifrost and plugin in the same Docker stage with the same toolchain |
| Learning looks fake | Medium | Seed from real feedback events in the demo; show posterior movement |
| Plugin API drift | Medium | Pin core version in `go.mod`; spike the interface in Wave 0 |

---

## 17. Acceptance criteria

1. `docker run` starts the full stack: Bifrost, plugin, sidecar, UI.
2. The eval harness runs 50 questions and prints a before/after table.
3. `go test ./...` passes in the plugin module.
4. The README documents build, run, config, policy, and the API.
5. The demo video shows all five acts in under 90 seconds.
6. The deck states problem, architecture, measured results, and PR shape.
7. No claim in the README is unsupported by a number the harness produced.
8. A stranger can run the image and reproduce the demo without a Go toolchain.

---

## 18. Resolved decisions

| Decision | Choice | Rationale |
|---|---|---|
| Repo strategy | **Standalone repo, `.so` plugin** | Supported path; no fork; better PR story |
| Hook | **`PreRequestHook` (policy) + `PreLLMHook` (rewrite) + `PostLLMHook` (record)** | Content modification belongs in `PreLLMHook`; memo on `ctx` prevents double Tavily spend |
| Autopsy API | **Sidecar** | `.so` plugins cannot register HTTP routes |
| Packaging | **Single Docker image** | One command to run, one image to share |
| UI | **Our own React app, served by the sidecar** | No fork of Bifrost's UI |
| Pitch | **Trust first, cost as measured side effect** | Differentiates from compressors; maps to MCP governance |
| Scope | **Cross-app learning stays; MCP and policy editor cut** | Learning is the strongest differentiator |
| AI surface | **Off-path claim extraction + autopsy attribution** | Satisfies the "Use of AI" criterion without polluting the decision path |
| Demo providers | **Real OpenAI + deterministic mock** | Authenticity plus reproducibility |

## 19. Rev 3 correction — hook contract

§7 (`Init`, `GetName`, `PreRequestHook`, `PreLLMHook`, `PostLLMHook`, `Cleanup`) and the §18 Hook row describe the
original plan. As built, content modification lives in **`PreRequestHook`** (runs once per top-level request,
before routing and every fallback attempt), recording in **`PostLLMHook`**, with header correlation via
`HTTPTransportPreHook`/`HTTPTransportResponseHeadersHook` (`plugin/bypass.go`, `plugin/correlate.go`). There is no
`PreLLMHook` symbol in `plugin/` — it was deliberately omitted because it re-runs per fallback attempt and would
double-spend Tavily credits. This keeps the "no fork, standard installation" claim intact; only the hook names in
§7/§18 were stale.
