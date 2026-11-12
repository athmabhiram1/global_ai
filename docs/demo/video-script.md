# Demo video script — Context Curator (120 seconds)

Source of every number: `examples/eval/results.md` (50 questions × 3 repeats, deterministic echo mock provider).
Live stack (single start): `docker compose up -d --build` → Bifrost `http://localhost:8080`, sidecar `http://localhost:8090`, Next console `http://localhost:3000`.
Total runtime target: ~120 s (acceptable range 85–150 s).

One line: *Compression asks how few tokens. We ask which sources are allowed to speak.*

## Setup (before recording)

1. `docker compose up -d --build`; verify `http://localhost:8080/v1/models`, `http://localhost:8090/healthz`, `http://localhost:3000/console`.
2. Seed one decision: run the curl in Shot 4 at least once so `/console` traces has a row.
3. Open tabs in order: terminal (curl) → `http://localhost:3000/console` (Traces) → decision drawer → Autopsy → Sources → Policy.
4. Have `examples/eval/results.md` summary block ready in a tab, plus one pre-recorded screen capture of each live beat (see FALLBACK column).

## Seeded chat — exact curl (mock provider, deterministic echo)

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mock/mock-model",
    "temperature": 0.0,
    "messages": [
      {"role": "user", "content": "How much is Pro?"},
      {"role": "tool", "content": "Pro is $49/seat/month. Source: https://example.com/pricing (fetched 2026-11-03)"},
      {"role": "tool", "content": "Pro is $39/seat/month. Source: https://stale-blog.example/post (fetched 2024-02-01)"},
      {"role": "tool", "content": "Pro dealz!!! Source: https://content-farm.example/deals (fetched 2026-11-03)"}
    ]
  }'
```

Expected: curated answer echoes the `$49` chunk; `$39` drops as `stale`, content-farm drops as `authority_denied`. Model is `mock/mock-model` (deterministic echo) — it repeats admitted context; curation, tokens, and latency deltas measure the plugin only.

## Shot-by-shot

| TIME | SHOT (exact URL / click) | NARRATION (verbatim) | FALLBACK if live fails |
|---|---|---|---|
| 0:00–0:12 | Full-screen title card + terminal showing the gateway receiving a request. Camera: title text "Your agent read a poisoned page." then the tool-result paste scrolling past. | "Your agent searched the web, pasted everything into the prompt, and the gateway forwarded all of it without an opinion." | Pre-recorded 12 s clip of the same scroll (file: `fallback-00-poison.mp4`). On-screen text carries it; no voiceover needed. |
| 0:12–0:20 | Same terminal: highlight the stale `$39` chunk and the content-farm chunk inside the outgoing request. Camera must show both dollar figures in the request body. | "A stale blog says thirty-nine dollars. A content farm says dealz. The current price is forty-nine — and nobody can say which chunk caused the wrong answer." | Freeze-frame PNG of the request body with `$39` and `content-farm.example` circled (`fallback-12-request.png`). |
| 0:20–0:32 | Diagram or `docker compose ps` output: one container, three ports. Camera: terminal `docker compose ps` showing `:8080`, `:8090`, `:3000`, then the README architecture block. | "Context Curator is one container. One plugin, sitting in the gateway's request path on port 8080, enforcing one source policy for every app." | Pre-recorded `docker compose ps` output screenshot (`fallback-20-stack.png`). |
| 0:32–0:45 | Browser `http://localhost:3000/console` → Policy section. Camera must show effective mode (`rewrite`), deny list, freshness classes (price 24 h), min independent sources 2. | "No reranker, no compressor, no LLM on the admission path. Fixed weights, published and tested — the same request and policy always produce the same decision, with a reason code for every drop." | Screenshot of `/console` Policy section with mode + deny list visible (`fallback-32-policy.png`). |
| 0:45–1:00 | LIVE BEAT 1 — terminal runs the exact curl above against `http://localhost:8080/v1/chat/completions`. Camera must show the command, `mock/mock-model`, and the echoed `$49` answer in the response. | "Watch it live. One chat request through the gateway on port 8080, using the deterministic mock model. The answer comes back forty-nine dollars — the stale thirty-nine never reaches the model." | Pre-recorded terminal run of the same curl with visible `$49` response (`fallback-45-curl.mp4`). |
| 1:00–1:12 | LIVE BEAT 2 — `http://localhost:3000/console` Traces section; a new decision row appears; click it to open the drawer. Camera must show the row (mode `rewrite`, kept/dropped counts) and the open drawer with per-chunk rows. | "Every request leaves a receipt. The decision row appears in Traces — open it, and each chunk carries its domain, scores, and verdict." | Pre-recorded traces → drawer click-through (`fallback-60-drawer.mp4`). |
| 1:12–1:22 | LIVE BEAT 3 — inside the drawer, point at chunk score rows: `stale` on the `$39` chunk, `authority_denied` on the content-farm chunk, `duplicate_of` on the press-release copy. Camera must show at least two reason codes legibly. | "Nine of fourteen chunks fall in the eval seed, each with a reason. Stale. Authority denied. Duplicate. Nothing is dropped silently." | Freeze-frame of the drawer with reason codes legible (`fallback-72-reasons.png`). |
| 1:22–1:32 | LIVE BEAT 4 — Autopsy tab: run autopsy **with** the retained `$49` chunk, then **without** it (ablate by chunk ID). Camera must show the two memos side by side and the changed-sentence highlight. | "And we can prove it. Autopsy replays the same request with one chunk removed. Remove chunk seven, the sentence flips. It wasn't the model — it was chunk seven." | Pre-recorded autopsy side-by-side diff (`fallback-82-autopsy.mp4`). |
| 1:32–1:42 | LIVE BEAT 5 — Sources section: click Deny on a domain (e.g. `content-farm.example`); switch to Policy section and show it in the kill list. Camera must show the click and the kill-list row. | "Deny a domain in Sources, and it lands in the Policy kill-list — fleet-wide, on the very next request, for every app behind the gateway." | Pre-recorded deny click → kill-list row (`fallback-92-deny.mp4`). |
| 1:42–1:52 | MEASURED STRIP — full `examples/eval/results.md` Summary block on screen, held **≥ 4 seconds** (count "one-one-thousand…" to four). Camera: static, whole block legible, no scrolling. Numbers on screen: `0.480 → 1.000 (+52pp)`, `416 → 366 (−12.0%)`, `8 ms → 8 ms`, `50 questions × 3 repeats, deterministic echo mock provider`. | "Measured, not narrated. Fifty questions, three repeats each. Accuracy: zero point four eight zero to one point zero zero zero. Tokens: four-sixteen to three-six-six — twelve percent. Latency: eight milliseconds to eight milliseconds." | Static PNG of the results Summary block held 5 s (`fallback-102-results.png`). |
| 1:52–2:00 | Closing card over the console. On-screen text: "Compression asks how few tokens. We ask which sources are allowed to speak." | "So the question for your agents is not how much context you can afford. It is which sources you trust to speak." | Title card PNG with the closing line (`fallback-112-close.png`). |

## Camera rules (every claim)

- Every number spoken must be visible on screen at the same time (results block, drawer, or console strip).
- Every "live" claim must show the URL bar (`:8080`, `:3000/console`) or the terminal command in frame.
- Reason codes (`stale`, `authority_denied`, `duplicate_of`) must be legible, not described off-screen.
- The measured strip (1:42–1:52) must be a static hold ≥ 4 s — no scroll, no cut, no voiceover-only numbers.
- Record at 1080p; sound-off test: the on-screen text alone must carry each act (per `docs/demo/storyboard.md`).

## DO-NOT-SAY list

1. **No ≥40% token claim.** The honest measured saving is **12.0%** (416 → 366). Never say 40%, "nearly half", or any larger figure.
2. **No mock-data-under-LIVE claims.** The provider is the **deterministic echo mock** (`mock/mock-model`); say so on camera. Never imply a frontier model produced the answers, and never present pre-recorded clips as live.
3. **No "LLM judged the sources" claims.** The admission path contains **no LLM** — fixed, published weights only. The mock echoes admitted context; it does not evaluate trust.
4. **No latency-win claims.** Latency is **8 ms → 8 ms** (unchanged). Say "no latency cost", never "faster".
5. **No accuracy claims beyond the eval.** Accuracy is **0.480 → 1.000 on the 50-question trap set** (must/must-not-contain scoring), not a general benchmark.
6. **No cross-app magic beyond what is shown.** The deny kill list is fleet-wide for apps behind this gateway; do not claim per-app policies, user accounts, or hosted-Vercel behavior in the live stack.
