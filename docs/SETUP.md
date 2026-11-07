# Setup and operation

All commands below were run on Windows 11 with PowerShell and Docker Desktop.
You need Docker only — no Go, Node, or WSL on the host. Every `go`
invocation in this guide runs inside the pinned `golang:1.27.3-bookworm`
container; the module cache volume `cc-gomod` keeps repeats fast.

## 0. One command (the whole product)

```powershell
docker compose up -d --build
```

One Compose stack (`global-hackathon`), one container (`global-hackathon`),
one start button in Docker Desktop. It builds the image (Bifrost +
`contextcurator.so` + mock provider + sidecar + Next console UI) and starts
it with the primary console on `localhost:3000`, Bifrost on `localhost:8080`
(gateway) and the sidecar on `localhost:8090` (API + legacy fallback UI).
Keys come from the environment or a `.env`
file next to `docker-compose.yml` (`OPENAI_API_KEY`, `TAVILY_API_KEY`;
both optional for the mock-only demo). The shared SQLite database and
Bifrost config live on the `cc-data` volume at `/data` — see §8 before
sharing the volume: decisions persist prompt and tool text.

```powershell
docker compose ps      # one service, healthy
docker compose logs -f # all four processes
docker compose down    # clean stop (< 5 s)
```

Docker Desktop groups the stack under `global-hackathon` (Compose project
names are lowercase by rule). Share the repo and anyone runs the same
command; the published-image variant is Task 4.2.

## 1. Build the image (without Compose)

```powershell
docker build -t context-curator:wave3 .
```

This compiles Bifrost from the pinned upstream commit, builds the
`contextcurator.so` plugin against the same module graph, and ships the
sidecar plus a deterministic mock provider in one image (~450 MB).
A slow first build is the upstream `git clone`; later builds are cached.

## 2. Run a stack

```powershell
./examples/run-stack.ps1
```

Starts container `cc-wave3` publishing Bifrost on `127.0.0.1:18080` and the
sidecar on `127.0.0.1:18090`, then disables auth enforcement inside the
throwaway container. Host ports 8080/8090 are intentionally avoided (they
may belong to another container); override with `-BifrostPort` /
`-SidecarPort`, and `-Container` for a second stack.

Fresh hosts enforce virtual-key auth (`401 virtual_key_required`). Two ways
through, in order:

1. Set `$env:BF_VIRTUAL_KEY` to a provisioned key (sent as `x-bf-vk`).
2. Otherwise set `$env:BIFROST_SETUP_TOKEN` (default `dev-setup-token`);
   the script calls `PUT /api/config` with the `X-Bifrost-Setup-Token`
   header and a nested `client_config{allow_direct_keys,
   enforce_auth_on_inference, log_retention_days: 7}` body.

Modes: `-Mode rewrite` (default), `-Mode annotate` (record only),
`-Mode block` (reject on hard deny). The mode is written into the
container's `config.json` before start.

## 3. Ninety-second demo

With the rewrite stack up:

```powershell
$env:BIFROST_URL = "http://127.0.0.1:18080"
$env:SEED_DIR = "examples/seed/pages"
docker run --rm -e GOWORK=off -e BIFROST_URL=http://host.docker.internal:18080 `
  -e SEED_DIR=/work/examples/seed/pages -v "${PWD}:/work" `
  -v cc-gomod:/go/pkg/mod -w /work/examples/apps `
  golang:1.27.3-bookworm go test -count=1 ./support/ ./docs/ ./research/
```

Three apps ask one question each through the gateway; the mock provider
echoes the curated request, so the assertions prove the injection:

- support: "How much is Pro?" → contains `$` (stale `$39` refused)
- docs: version question → contains `1.24`
- research: retention question → contains `7-year`

`host.docker.internal` is required: `127.0.0.1` inside the test container
is the test container itself, not your host.

## 4. Reproduce the eval

Start the curated stack (above) plus the raw baseline:

```powershell
./examples/run-stack.ps1 -Mode annotate -Container cc-eval-raw `
  -BifrostPort 18081 -SidecarPort 18091
```

Then, from the repo root:

```powershell
docker run --rm -e EVAL_RAW_URL=http://host.docker.internal:18081 `
  -e EVAL_CURATED_URL=http://host.docker.internal:18080 `
  -e SEED_DIR=/work/examples/seed/pages -v "${PWD}:/work" `
  -v cc-gomod:/go/pkg/mod -w /work golang:1.27.3-bookworm `
  go run ./examples/eval
```

Fifty questions × two conditions × three repeats against the deterministic
mock provider. Measured 2026-11-03 (`examples/eval/results.md`):

| | raw (annotate) | curated (rewrite) |
|---|---|---|
| mean accuracy | 0.480 | **1.000** (+52pp) |
| mean provider tokens | 416 | **366** (−12.0%) |
| mean latency | 8 ms | 8 ms |

Accuracy is 1 per question when the echoed answer contains every
`must_contain` token and none of the `must_not_contain` tokens. The mock
is free, so token/latency deltas measure curation only.

## 5. Run the unit suites

```powershell
docker run --rm -v "${PWD}/plugin:/src" -v cc-gomod:/go/pkg/mod `
  -w /src golang:1.27.3-bookworm go test -count=1 ./...
docker run --rm -v "${PWD}:/work" -v cc-gomod:/go/pkg/mod `
  -w /work/sidecar golang:1.27.3-bookworm go test -count=1 ./...
```

Plus `gofmt -l .` (empty) and `go vet ./...` in each module before any
commit. Never edit a `FROZEN — DO NOT EDIT` test file; failing frozen
tests are fixed by changing production code (plan amendment required
otherwise).

## 6. Configuration

Policy is the plugin's `config` block in `config/bifrost.json`
(container: `/data/bifrost/config.json`), schema in `docs/ARCHITECTURE.md`
§8. The knobs that matter: `mode`, `budget.max_context_tokens` (4000),
`budget.max_chunks` (8), `freshness.classes` (price 24h, version 720h, law
168h, static 8760h), `authority.allow/deny`, `independence.min_sources`
(2). `require_primary_for` accepts only known freshness classes.

## 7. Serve the console

The primary console is the Next.js app: in Docker it runs on
`http://localhost:3000` and proxies same-origin `/api/cc/*` to the sidecar,
injecting `CC_ADMIN_TOKEN` server-side (the token never reaches the browser).
The sidecar on `:8090` keeps serving the legacy static fallback (`/srv/web`).

Legacy static console: open `web/template.html` directly in a browser — no build step. The sidecar
ships permissive CORS, so a `file://` page can call the API.

Two query params control the data source:

- `?sidecar=<url>` repoints the API base (default `http://localhost:8090`).
  With the dev stack from section 2, use
  `?sidecar=http://127.0.0.1:18090`.
- `?mock=1` forces the built-in sim data (same shapes as the sidecar
  contract) instead of calling the sidecar. Live is the default.

The deny/mode controls in the policy panel are local-only: they restyle the
console and steer newly simulated rows, but the gateway keeps enforcing the
policy baked into the container's `config.json` until you rerun
`run-stack.ps1` (section 2) with a new `-Mode`.

## 8. Deploy elsewhere

### Self-hosted Docker (single host)

Any single host with Docker works — one container, one persistent volume:

```bash
docker build -t context-curator:dev .
docker run -d --name context-curator --restart unless-stopped \
  -p 3000:3000 -p 8080:8080 -p 8090:8090 \
  -e OPENAI_API_KEY=sk-... -e TAVILY_API_KEY=tvly-... \
  -e CC_ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e CC_GATEWAY_TOKEN= \
  -v cc-data:/data \
  context-curator:dev
```

`/data` holds the shared SQLite database and Bifrost config
(`/data/bifrost/config.json`, seeded on first run). **Data note:** decisions
persist prompt and tool text — treat the volume as sensitive, back it up,
and wipe it before sharing an image.

### Render (Blueprint)

`render.yaml` at the repo root provisions one Docker `web` service plus a
persistent `cc-data` disk mounted at `/data`. Only `PORT` (3000, the Next
console) is reachable from the internet; `:8080`/`:8090` are intra-host
only. Set the `sync: false` env vars in the Render dashboard:

- `CC_SIDECAR_URL` defaults to `http://127.0.0.1:8090` (same host).
- `CC_ADMIN_TOKEN` — long random value; the Next server proxy injects it,
  it never reaches the browser.
- `CC_GATEWAY_TOKEN`, `OPENAI_API_KEY`, `TAVILY_API_KEY` as needed.

### Vercel (console only)

The Next console in `web/` deploys to Vercel as the UI tier; the sidecar
stays on a host that can reach the shared SQLite database (self-hosted
Docker or Render above).

1. Import the repo, set **Root Directory** to `web`.
2. Environment variables:
   - `CC_SIDECAR_URL=https://<sidecar-host>` (the `:8090` host, HTTPS).
   - `CC_ADMIN_TOKEN=<same token the sidecar expects>`.
3. Deploy. Browser calls hit same-origin `/api/cc/*`, which forwards to
   `CC_SIDECAR_URL` with the admin bearer injected server-side.

The eval strip shown by the console (accuracy 0.480 → 1.000,
tokens −12.0%, 8 ms) is sourced from `examples/eval/results.md`.

## Troubleshooting

- `401 virtual_key_required` → provision auth (section 2); the stack
  script treats a 401 from `/v1/models` as "up, auth-gated".
- `connection refused` from a test container → use
  `host.docker.internal`, not `127.0.0.1` (section 3).
- PowerShell has no `head`/`grep` and mangles `2>/dev/null` → use
  `Select-Object` and `Select-String` as in the examples above.
- `docker build` network errors on `go mod tidy` inside sidecar: the
  workspace build (`go.work` at the root) is the supported path; the
  image builds all modules from the pinned toolchain container.
- Ports already taken → `-BifrostPort`/`-SidecarPort`/`-Container`.
