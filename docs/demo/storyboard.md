# Demo storyboard — Context Curator (under 90 s, no narration required)

Total runtime: 85 s. One line: *Compression asks how few tokens. We ask which sources are allowed to speak.*
Source of every number: `examples/eval/results.md` (50 questions x 3 repeats, deterministic echo mock provider).
Story spine (same as `video-script.md`): every agent walks through ONE door — the Bifrost gateway.
A stale price walks through unchecked; the bouncer moves INTO the door. Sound-off: the on-screen text below carries each act alone.

| Act | Time | Duration | On-screen text |
|---|---|---|---|
| 1. The door | 0:00-0:12 | 12 s | "Every agent walks through ONE door." support-bot · docs-assistant · research-agent → Bifrost :8080. "A customer got the wrong price. Who told the bot that?" |
| 2. The drop (hero beat) | 0:12-0:34 | 22 s | "Replay with the curator: kills carry reasons." `$39` refused (`stale`), `$49` kept, farm post dropped (`authority_denied`). Answer comes back $49. Tokens fall 416 → 366 (−12.0%). |
| 3. The proof (eval table beat) | 0:34-0:54 | 20 s | "Measured, not narrated." Before/after table from `examples/eval/results.md`: mean accuracy 0.480 → 1.000 (+52pp); mean provider tokens 416 → 366 (−12.0%); mean latency 8 ms → 8 ms. Autopsy removes the good chunk; its sentences vanish. "It wasn't the model. It was the chunk." |
| 4. The fleet | 0:54-1:10 | 16 s | "One table, all apps." Deny the farm domain in Sources; it lands in the Policy kill list. The docs assistant, never configured, already drops it — learned at the door, enforced everywhere. |
| 5. The control | 1:10-1:25 | 15 s | "One policy for every agent." Policy panel: rewrite mode, denied domains, price max age 24 h, minimum 2 independent sources. Closing line: "Compression asks how few tokens. We ask which sources are allowed to speak." |

## Shot notes

- Act 1: the door diagram (three apps → one gateway box) plus the support-bot UI showing the $39 answer.
- Act 2 (hero): the request drawer — kept/dropped chunks with reason codes (`stale`, `authority_denied`). Freeze one frame on the $39 → $49 flip.
- Act 3 (proof): full `results.md` summary block on screen for at least 4 s so judges can read 0.480 → 1.000, 416 → 366, 8 ms → 8 ms. Then the autopsy side-by-side memos with the removed-sentence highlight and "mattered: removed N of M" attribution.
- Act 4: Sources deny click → Policy kill-list row; one reputation table, highlight the shared domain row.
- Act 5: policy panel (rewrite mode, deny list, price 24 h, min_sources 2) beside the closing line.
- Sound off test: every act carries its point in on-screen text alone. If a beat needs voiceover to land, re-record.
