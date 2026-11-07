# Submission checklist — Context Curator

Numbers grounded in `examples/eval/results.md`. Check each box before submitting.

- [ ] Repository is public and clonable.
- [ ] README documents: what it is, one-liner, 90-second demo, `docker run`, config/policy, API, eval command, measured numbers (0.480 -> 1.000 accuracy, 416 -> 366 tokens, 8 ms latency), Bifrost integration, Tavily integration, PR shape.
- [ ] `go test ./...` passes in `plugin/` and `sidecar/` (non-vacuous: >= 1 `*_test.go` per new source file).
- [ ] Eval harness runs 50 questions x 3 repeats and reproduces `examples/eval/results.md`.
- [ ] No README/deck claim lacks a harness-produced number.
- [ ] Demo video: five acts, under 90 s (storyboard: 85 s at `docs/demo/storyboard.md`), sound-off legible.
- [ ] Deck covers problem, demo still, architecture, measured table, Bifrost fit, Tavily fit, PR shape (`docs/deck/outline.md`).
- [ ] Primary theme: Bifrost (native `.so` plugin, supported hooks, standard installation, setup docs, tests, upstream-PR shape).
- [ ] Tavily track checkbox: yes (pre-emptive stale-source admission control + per-chunk/per-claim freshness via live search/extract).
- [ ] One-container run: `docker run -p 8080:8080 -p 8090:8090 -e OPENAI_API_KEY=... -e TAVILY_API_KEY=... <image>` starts Bifrost + plugin + sidecar + UI with no host Go toolchain.
