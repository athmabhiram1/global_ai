# Demo storyboard — Context Curator (under 90 s, no narration required)

Total runtime: 85 s. One line: *Compression asks how few tokens. We ask which sources are allowed to speak.*
Source of every number: `examples/eval/results.md` (50 questions x 3 repeats, deterministic echo mock provider).

| Act | Time | Duration | On-screen text |
|---|---|---|---|
| 1. The bill | 0:00-0:12 | 12 s | "Same model. Same question. Raw context first." Pricing support bot asks: "How much is Pro?" Raw run shows 14 chunks in, wrong answer ($39 stale price), 416 mean tokens, 0.480 mean accuracy. |
| 2. The drop (hero beat) | 0:12-0:34 | 22 s | "Replay with the curator: 9 of 14 chunks fall, each with a reason." Stale price ($39) refused, current price ($49) kept, denied domain dropped (`authority_denied`), press-release duplicates collapsed (`duplicate_of`). Answer flips to $49/seat/month. Cost falls: 416 -> 366 tokens (-12.0%). |
| 3. The proof (eval table beat) | 0:34-0:54 | 20 s | "Measured, not narrated." Before/after table from `examples/eval/results.md`: mean accuracy 0.480 -> 1.000 (+52pp); mean provider tokens 416 -> 366 (-12.0%); mean latency 8 ms -> 8 ms. Click the wrong sentence; autopsy removes chunk 7; the sentence flips. "It wasn't the model. It was chunk 7." |
| 4. The fleet | 0:54-1:10 | 16 s | "One table, all apps." The docs assistant, never configured, already drops the known-bad domain learned from the support bot. Cross-app Beta reputation moves on screen. |
| 5. The control | 1:10-1:25 | 15 s | "One policy for every agent." Policy panel: denied domains, price max age 24 h, minimum 2 independent sources. Closing line: "Compression asks how few tokens. We ask which sources are allowed to speak." |

## Shot notes

- Act 1: terminal running the raw (`annotate`) eval leg plus the support-bot UI showing the $39 answer.
- Act 2 (hero): the request drawer — 14 chunks in, 5 kept, 9 dropped with reason codes (`stale`, `authority_denied`, `duplicate_of:c3`, `low_relevance`, `over_budget`). Freeze one frame on the $39 -> $49 flip.
- Act 3 (proof): full `results.md` summary block on screen for at least 4 s so judges can read 0.480 -> 1.000, 416 -> 366, 8 ms -> 8 ms. Then the autopsy side-by-side diff.
- Act 4: two app windows, one reputation table, highlight the shared domain row.
- Act 5: policy YAML excerpt (price: 24 h, min_sources: 2, deny list) beside the UI policy panel.
- Sound off test: every act carries its point in on-screen text alone. If a beat needs voiceover to land, re-record.
