# Recording script — Context Curator (FINAL, 120 s)

Read this verbatim. Bifrost is the protagonist: every agent walks through ONE
door, and the bouncer stands IN that door. Numbers only from
`examples/eval/results.md`. Obey the DO-NOT-SAY list in `video-script.md`.

Setup: `docker compose up -d --build`. Tabs open: terminal → `:3000/console`.
Seed: run the curl in Shot 3 once before recording so Traces has a fresh row.

## 0:00–0:12 — The door
ON SCREEN: title card — three app chips (support-bot, docs-assistant,
research-agent) → one box labeled "Bifrost :8080".
SAY: "Every agent in this company walks through one door to reach a model:
the Bifrost gateway. Last quarter, a customer got quoted a stale price, and
the post-mortem asked one question: who told the bot that?"

## 0:12–0:25 — The poison walks in
ON SCREEN: terminal, the outgoing request JSON with three tool chunks.
Highlight `$39` and `content-farm.example`.
SAY: "Forty-nine is current. Thirty-nine is a stale blog. Dealz is a poisoned
farm post. All three walk through the same door — and the door checks no IDs."

## 0:25–0:38 — The bouncer moves into the door
ON SCREEN: `docker compose ps` (one container, :8080 :8090 :3000), then the
README architecture diagram.
SAY: "Context Curator is one container. The bouncer is a native plugin living
inside the gateway process itself — PreRequestHook, once per request, no extra
hop — enforcing one source policy for every app behind the door."

## 0:38–0:48 — The rulebook
ON SCREEN: console Policy section. Hold on effective mode `rewrite`, the deny
list, freshness `price 24 h`, min sources 2.
SAY: "No reranker, no compressor, no LLM on the admission path. Fixed weights,
published and tested — the same request always produces the same decision,
with a reason code for every drop."

## 0:48–1:00 — LIVE: the request
ON SCREEN: terminal. Run the seed curl against `:8080/v1/chat/completions`
with `mock/mock-model`. Show the echoed `$49` answer.
SAY: "Watch it live. One chat request through the door on port 8080. The answer
comes back forty-nine dollars — the stale thirty-nine never reaches the model.
That model is a deterministic echo mock; it repeats admitted context, nothing
more."

## 1:00–1:12 — LIVE: the receipt
ON SCREEN: console Traces. A new decision row appears. Click it — the drawer
opens with per-chunk rows.
SAY: "Every request leaves a receipt at the door. The row appears in Traces —
open it, and each chunk carries its domain, scores, and verdict."

## 1:12–1:22 — LIVE: the reasons
ON SCREEN: inside the drawer, point at `stale` on the $39 chunk and
`authority_denied` on the farm chunk. Legible, hold 2 s each.
SAY: "Every kill carries a reason code, written into the receipt. Stale.
Authority denied. Nothing is dropped silently — the post-mortem answers
itself."

## 1:22–1:34 — LIVE: the proof
ON SCREEN: Autopsy tab. Run autopsy on the retained `$49` chunk. Show both
memos, the highlighted removed sentence, and the attribution line reading
"mattered: removed N of M sentences".
SAY: "And we can prove it. Autopsy replays the same request through the same
door with one chunk removed. Remove the good chunk, and its sentences vanish
from the answer. It wasn't the model — it was the chunk."

## 1:34–1:44 — LIVE: the fleet fix
ON SCREEN: Sources section. Click Deny on `content-farm.example`. Switch to
Policy — show it in the kill list.
SAY: "Deny a domain in Sources, and it lands in the Policy kill-list —
fleet-wide, on the very next request, for every app behind the door. Fix it
once, at the door, not in every app."

## 1:44–1:54 — MEASURED, static hold ≥ 4 s
ON SCREEN: full `examples/eval/results.md` Summary block. No scroll, no cut.
Read: `0.480 → 1.000 (+52pp)`, `416 → 366 (−12.0%)`, `8 ms → 8 ms`,
`50 questions × 3 repeats, deterministic echo mock provider`.
SAY: "Measured, not narrated. Fifty questions, three repeats each. Accuracy:
zero point four eight zero to one point zero zero zero. Tokens: four-one-six
to three-six-six — twelve percent. Latency: eight milliseconds to eight
milliseconds."

## 1:54–2:00 — Close
ON SCREEN: closing card over the console.
SAY: "Compression asks how few tokens. We ask which sources are allowed to
speak."
TEXT: "Compression asks how few tokens. We ask which sources are allowed to speak."
