# Context Curator

Admission control for LLM context, enforced inside the gateway. A native Bifrost plugin scores every retrieved chunk — authority, freshness, independence, learned trust — and only what earns its place reaches the model. Every rejection carries a reason code; every decision is provable by replay.

## How it works

```
apps ──► Bifrost :8080 ── PreRequestHook ──► provider (mock / OpenAI)
                  │
                  │  segment → provenance → hard-deny → score
                  │       → Tavily refresh → cluster → select (MMR) → rewrite
                  ▼
         decisions + requests ──► SQLite (one file)
                  ▼
         cc-sidecar :8090 ── read-only API + autopsy replay
                  ▼
         Next.js console :3000 (same-origin /api/cc/* proxy)
```

1. **Segment & provenance.** Tool messages are split into chunks; absolute URLs in the text establish the chunk's domain and whether provenance is `known` or `inferred`.
2. **Score.** Five published weights — relevance, authority tier, freshness class, independence, learned Beta utility — combine into one score per chunk. No LLM on the admission path.
3. **Refresh.** Stale chunks with a source URL get one Tavily lookup (Bifrost relay, HTTP fallback, per-request credit budget). Refresh never drops — failure is recorded as `refresh_failed`.
4. **Select & rewrite.** Near-duplicates collapse, the set is cut to budget by MMR, kept chunks are paired back into the request in place. `annotate` records without touching; `block` refuses on hard deny.
5. **Receipt.** One decision row per request: kept/dropped IDs, reason codes, token counts, full per-chunk records.
6. **Proof.** Autopsy replays the recorded request with one chunk removed and diffs the answer sentence by sentence.

## Measured results

50 trap questions × 3 repeats, raw (`annotate`, pass-through) vs curated (`rewrite`), deterministic echo mock. Accuracy is 1 per question iff the echoed answer contains every `must_contain` token and none of the `must_not_contain` tokens. Full table: [examples/eval/results.md](examples/eval/results.md).

| | raw | curated |
|---|---|---|
| mean accuracy | 0.480 | **1.000** (+52pp on this trap set) |
| mean provider tokens | 416 | **366 (−12.0%)** |
| mean latency | 8 ms | 8 ms (unchanged) |

Traps covered: stale prices (`$39` refused, `$49` kept), denied domains (`authority_denied`), near-duplicate press releases (collapsed), version/law controls. The echo mock repeats admitted context only — deltas measure curation, not model judgement.

## Screenshots

Live console (`http://localhost:3000`):

![01 — Landing: hero and request-path graph](docs/demo/shots/01-landing.png)

![02 — Traces: the decision ledger, one receipt per request](docs/demo/shots/02-traces.png)

![03 — Drawer: the decision file — per-chunk domain, scores, verdict](docs/demo/shots/03-drawer.png)

![04 — Sources: reputation table, deny a domain fleet-wide](docs/demo/shots/04-sources.png)

![05 — Policy: effective mode, deny list, freshness classes](docs/demo/shots/05-policy.png)

![06 — Evals: the measured strip, sourced from results.md](docs/demo/shots/06-evals.png)

## Quickstart

Requirements: Docker only. Go and Node are not needed on the host.

```bash
docker compose up -d --build
```

Send one request through the gateway (mock provider, deterministic echo):

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

Expected: the answer echoes `$49`; `$39` drops as `stale`, content-farm drops as `authority_denied`.

Then open **http://localhost:3000** — Traces shows the new row; click it for the decision file, then Autopsy, Sources, Policy. Ports: `:8080` gateway, `:8090` sidecar API, `:3000` console. Operations guide: [docs/SETUP.md](docs/SETUP.md). Containers: [docker-compose.yml](docker-compose.yml). Hosted recipe: [render.yaml](render.yaml).

## Console

- **Traces** — one row per request with kept/killed counts, token delta, mode; click for the drawer.
- **Drawer** — the decision file: per-chunk domain, authority tier, freshness, tokens, score bars, drop reasons, claim freshness, execution trace.
- **Autopsy** — pick a retained chunk; the sidecar replays with/without it and highlights changed sentences with an influence score.
- **Sources** — Beta reputation per domain; good/bad feedback moves the posterior; deny hard-blocks fleet-wide.
- **Policy** — effective mode (`annotate`/`rewrite`/`block`, live-switchable), deny list, freshness classes, kill list.
- **Evals** — the measured strip from `results.md`. Append `?demo=1` for a labeled seeded tour.

## API

All sidecar routes require `Authorization: Bearer $CC_ADMIN_TOKEN` (the Next proxy injects it server-side).

| Method & path | Purpose |
|---|---|
| `GET /healthz` | Liveness |
| `GET /api/context-curator/decisions` | Recent decisions, newest first |
| `GET /api/context-curator/decisions/:id` | One decision with chunk records |
| `GET /api/context-curator/reputation` | Domain posteriors |
| `POST /api/context-curator/feedback {domain, verdict}` | `good`/`bad` → α/β update |
| `POST /api/context-curator/deny {domain, denied}` | Hard-block a domain |
| `POST /api/context-curator/policy/mode {mode}` | Live mode switch |
| `GET /api/context-curator/policy/summary` | Effective policy as JSON |
| `GET /api/context-curator/policy` | Raw policy YAML |
| `POST /api/context-curator/autopsy {request_id, chunk_id}` | Counterfactual replay + sentence diff |
| `GET /api/context-curator/claims/:hash` | Cached claim freshness |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CC_ADMIN_TOKEN` | `dev-token` | Bearer for sidecar admin routes; never reaches the browser |
| `CC_SIDECAR_URL` | `http://127.0.0.1:8090` | Where the Next server proxy forwards `/api/cc/*` |
| `OPENAI_API_KEY` | `unused` | Live models; `unused` keeps the deterministic mock only |
| `MOCK_API_KEY` | `unused` | Mock provider credential |
| `TAVILY_API_KEY` | `unused` | Live freshness evidence; unset degrades refresh to `refresh_failed`, never blocks |
| `BIFROST_SETUP_TOKEN` | `dev-setup-token` | One-time gateway config bootstrap |
| `PORT` | `3000` | Next console port |

Policy itself lives in the plugin `config` block (`config/` → `/data/bifrost/config.json`); schema in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §8. Modes: `annotate` (record, change nothing — safe default) · `rewrite` (drop inadmissible) · `block` (reject on hard deny).

## Development

```bash
# Go unit suites (frozen acceptance tests stay untouched)
docker run --rm -v "${PWD}:/src" -w /src golang:1.27.3-bookworm \
  sh -c "go test ./plugin/... ./sidecar/... -count=1"

# Frontend (144 tests, typecheck, production build)
cd web && npm test && npx tsc --noEmit && npm run build

# 50-question eval (needs two stacks: rewrite on :18080, annotate on :18081)
./examples/run-stack.ps1 -Mode rewrite  -Container cc-wave3 -Image context-curator:dev -BifrostPort 18080 -SidecarPort 18090
./examples/run-stack.ps1 -Mode annotate -Container cc-eval-raw -Image context-curator:dev -BifrostPort 18081 -SidecarPort 18091
docker run --rm -v "${PWD}:/src" -w /src \
  -e EVAL_RAW_URL=http://host.docker.internal:18081 \
  -e EVAL_CURATED_URL=http://host.docker.internal:18080 \
  golang:1.27.3-bookworm sh -c "go test ./examples/eval/ -count=1"
```

| Path | Contents |
|---|---|
| `plugin/` | The `.so` — segment, provenance, score, refresh, cluster, select, rewrite, record |
| `sidecar/` | `:8090` API — decisions, autopsy replay, reputation, claims |
| `web/` | Next.js 16 console on `:3000` |
| `examples/eval/` | 50-question harness + [results.md](examples/eval/results.md) |
| `config/` | Gateway + policy seed config |
| `docs/demo/` | [video-script.md](docs/demo/video-script.md), [storyboard.md](docs/demo/storyboard.md), shots |

## Limitations

- All demo answers and eval numbers come from `mock/mock-model`, a deterministic echo — it repeats admitted context; it does not evaluate trust or resemble a frontier model.
- Pure-removal influence is **0 by spec** (nothing substituted); attribution names removals instead, and Autopsy proves kept-chunk influence by replay with/without.
- Decisions written before chunk persistence show counts without per-chunk rows; new decisions carry the full decision file.
- Not claimed: frontier-model results, latency wins, savings beyond the measured 12.0%, security guarantees, per-app policies. It enforces one gateway source policy with a reason code per drop.

## Origin

Built for the Global AI Hackathon as a **Bifrost gateway extension** (native Go `.so` plugin). The Tavily refresh path inside counts toward both technologies. Submission needs: public repo + PPT link + ≤ 3 min demo video (deadline Nov 15, 23:59 IST). TODO (owner: submitter): `PPT: <link>`, `VIDEO: <link>`.

---

Compression asks how few tokens. We ask which sources are allowed to speak.
