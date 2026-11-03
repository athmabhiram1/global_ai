# Setup and operation

All commands below were run on Windows 11 with PowerShell and Docker Desktop.
You need Docker only — no Go, Node, or WSL on the host. Every `go`
invocation in this guide runs inside the pinned `golang:1.27.3-bookworm`
container; the module cache volume `cc-gomod` keeps repeats fast.

## 1. Build the image

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
| mean latency | 9 ms | 9 ms |

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
