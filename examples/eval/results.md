# Context Curator eval ΓÇö before/after

Raw = plugin in annotate mode (observe only, request passes through). Curated = plugin in rewrite mode. Each cell is the mean of 3 repeats against the deterministic mock provider; accuracy is 1 when the echoed answer contains every must_contain token and none of the must_not_contain tokens, else 0.

| id | question | raw acc | curated acc | raw tok | curated tok | raw ms | curated ms |
|----|----------|---------|-------------|---------|-------------|--------|------------|
| P01 | How much is Pro? | 0.00 | 1.00 | 411 | 361 | 11 | 10 |
| P02 | What does Pro cost per seat per month? | 0.00 | 1.00 | 419 | 369 | 8 | 9 |
| P03 | What is the current price of Acme Pro? | 0.00 | 1.00 | 419 | 369 | 7 | 8 |
| P04 | How much does Acme Pro cost? | 0.00 | 1.00 | 415 | 365 | 9 | 9 |
| P05 | Pro pricing per seat? | 0.00 | 1.00 | 411 | 361 | 8 | 8 |
| P06 | Is Pro billed annually and what does it cost? | 0.00 | 1.00 | 421 | 371 | 9 | 8 |
| P07 | What is the per-seat monthly price of Pro? | 0.00 | 1.00 | 419 | 369 | 7 | 8 |
| P08 | How much is a Pro seat? | 0.00 | 1.00 | 415 | 365 | 8 | 8 |
| P09 | Current Pro price, billed annually? | 0.00 | 1.00 | 413 | 363 | 9 | 8 |
| P10 | What do I pay per month for Pro? | 0.00 | 1.00 | 419 | 369 | 9 | 8 |
| P11 | Acme Pro cost for one seat? | 0.00 | 1.00 | 415 | 365 | 8 | 8 |
| P12 | Tell me the Pro subscription price. | 0.00 | 1.00 | 415 | 365 | 8 | 8 |
| F01 | Are there any deals on Pro? | 0.00 | 1.00 | 415 | 365 | 8 | 9 |
| F02 | What is the price for Pro at this time? | 0.00 | 1.00 | 421 | 371 | 7 | 8 |
| F03 | Any discounts on Acme Pro right now? | 0.00 | 1.00 | 417 | 367 | 9 | 8 |
| F04 | How much is Pro at the moment? | 0.00 | 1.00 | 417 | 367 | 7 | 9 |
| F05 | What offers exist for Pro seats? | 0.00 | 1.00 | 415 | 365 | 7 | 8 |
| F06 | Current offers on Acme Pro? | 0.00 | 1.00 | 413 | 363 | 8 | 9 |
| F07 | Should I buy Pro now or wait for a promotion? | 0.00 | 1.00 | 423 | 373 | 7 | 9 |
| F08 | What is the promotion on Pro? | 0.00 | 1.00 | 415 | 365 | 9 | 8 |
| V01 | Which Go version do I need to build 3.2? | 1.00 | 1.00 | 421 | 371 | 8 | 8 |
| V02 | What toolchain builds version 3.2? | 1.00 | 1.00 | 413 | 363 | 13 | 12 |
| V03 | Minimum Go version for 3.2? | 1.00 | 1.00 | 413 | 363 | 9 | 9 |
| V04 | Can I build 3.2 with an older toolchain? | 1.00 | 1.00 | 419 | 369 | 9 | 8 |
| V05 | Is my old toolchain still supported for 3.2? | 1.00 | 1.00 | 419 | 369 | 7 | 8 |
| V06 | What do I need to compile 3.2? | 1.00 | 1.00 | 417 | 367 | 9 | 8 |
| V07 | Does 3.2 build on older Go releases? | 1.00 | 1.00 | 417 | 367 | 8 | 8 |
| V08 | State the build requirement for version 3.2. | 1.00 | 1.00 | 417 | 367 | 8 | 8 |
| L01 | How long must customer records be kept? | 1.00 | 1.00 | 417 | 367 | 8 | 7 |
| L02 | What is the data retention period? | 1.00 | 1.00 | 415 | 365 | 8 | 8 |
| L03 | Retention law requirements for customer records? | 1.00 | 1.00 | 415 | 365 | 9 | 8 |
| L04 | For how many years do we retain records? | 1.00 | 1.00 | 419 | 369 | 8 | 8 |
| L05 | What does the 2024 retention law require? | 1.00 | 1.00 | 417 | 367 | 7 | 8 |
| L06 | Non-compliance fines relate to which retention rule? | 1.00 | 1.00 | 417 | 367 | 7 | 10 |
| L07 | Customer records retention under the law? | 1.00 | 1.00 | 415 | 365 | 9 | 10 |
| L08 | How long is data kept per the retention law? | 1.00 | 1.00 | 421 | 371 | 8 | 8 |
| R01 | What did Acme announce Pro at? | 1.00 | 1.00 | 415 | 365 | 9 | 8 |
| R02 | Launch price of Acme Pro? | 1.00 | 1.00 | 413 | 363 | 8 | 9 |
| R03 | Pro now available at what price? | 1.00 | 1.00 | 415 | 365 | 7 | 9 |
| R04 | What is the Pro pricing update? | 1.00 | 1.00 | 415 | 365 | 8 | 8 |
| R05 | Acme launches Pro: at what cost? | 1.00 | 1.00 | 415 | 365 | 8 | 8 |
| R06 | Pro availability announcement price? | 1.00 | 1.00 | 411 | 361 | 8 | 7 |
| R07 | How is Pro priced in the press release? | 1.00 | 1.00 | 419 | 369 | 8 | 8 |
| R08 | New Pro release cost? | 1.00 | 1.00 | 411 | 361 | 9 | 8 |
| M01 | What is the real current price of Pro, not the old launch figure? | 0.00 | 1.00 | 429 | 379 | 7 | 10 |
| M02 | How much is Pro, ignoring stale posts and spam? | 0.00 | 1.00 | 421 | 371 | 7 | 8 |
| M03 | Authoritative Pro price? | 0.00 | 1.00 | 409 | 359 | 7 | 7 |
| M04 | What should I actually pay for Pro per seat? | 0.00 | 1.00 | 421 | 371 | 9 | 7 |
| M05 | True price of Pro, without marketing spam? | 0.00 | 1.00 | 417 | 367 | 7 | 8 |
| M06 | Official Pro seat price? | 0.00 | 1.00 | 411 | 361 | 8 | 9 |

## Summary

- questions: 50, repeats per condition: 3
- mean accuracy raw: 0.480, curated: 1.000 (delta +0.520)
- mean provider tokens raw: 416, curated: 366 (savings 12.0%)
- mean latency raw: 8 ms, curated: 8 ms
- provider is the deterministic echo mock, so token/latency deltas measure curation only; no model judgement is involved.
