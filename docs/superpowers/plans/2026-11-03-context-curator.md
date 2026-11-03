# Context Curator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Bifrost `.so` plugin that performs deterministic admission control on LLM context, plus a sidecar that proves causality by ablation, plus one Docker image that runs the whole demo.

**Architecture:** Standalone repo. Plugin compiled with `-buildmode=plugin` against the same Go toolchain that builds Bifrost with `DYNAMIC=1`. `PreRequestHook` resolves policy and reserves Tavily credits; `PreLLMHook` runs the pipeline and rewrites content, memoised on `ctx` so fallbacks cost nothing; `PostLLMHook` records the decision. A sidecar serves autopsy, reputation, claims, and the React UI from a shared SQLite file. Everything runs in one container under supervisord.

**Tech Stack:** Go 1.24+, `maximhq/bifrost/core` (pinned), `modernc.org/sqlite`, Vite + React + Tailwind, Docker multi-stage on Debian bookworm, Tavily REST.

**Spec:** `docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/VERIFICATION.md`

---

## Global Constraints

- Deadline **15 Nov 2026, 23:59**. Solo. 12 working days.
- **One container.** `docker run -p 8080:8080 -p 8090:8090 ...` must start everything.
- **No fork of Bifrost.** Stock source, dynamic build, plugin loaded as `.so`.
- **No LLM in the admission path.** The only model calls are claim extraction and autopsy attribution, both off-path.
- **User-authored prose is never rewritten.** Only `role: tool` messages and `<context>` blocks.
- Every dropped chunk carries a reason code from the fixed list.
- Tavily failure degrades to `annotate`; it never blocks a request.
- Token counting must state its method in the decision record.
- Determinism: identical input + policy + reputation ⇒ identical decision. Ties break on content hash.
- Default mode is `annotate` for routes with no policy.
- Plugin and Bifrost built in the **same** Docker stage. Never build the `.so` on Windows.
- `go test ./...` passes in `plugin/` and `sidecar/` before every commit.
- **TDD-Immutability Rule (FROZEN — DO NOT EDIT):** Wave 1 tests are written FIRST from each task's acceptance criteria at the hardest difficulty and are then FROZEN. A failing frozen test blocks its task; only non-test source files may change to reach green. Test edits require a plan amendment entry with a reason. `go test ./...` must be non-vacuous (≥1 `*_test.go` per new source file) before any Wave 1 commit.
- **Task 0.2 correction:** `Init(nil)` applies defaults and succeeds (it unmarshals `null` to a zero Config, then defaults + Validate pass) — the plan's old `TestInitRejectsNil` expectation is superseded; the frozen test asserts `Init(nil) == nil` with annotate defaults instead. No production code is weakened to fit a test; the plan expectation was the thing that contradicted the implementation.
- Commit prefixes: `feat(cc):`, `test(cc):`, `chore(cc):`, `docs(cc):`.

## Source-verified corrections (read before Task 0.1)

These were verified against `maximhq/bifrost` at commit `54ad3ab`, not against the docs site. Where this
section disagrees with a task below, this section wins.

1. **`BifrostRequest` has no `Input` field.** Chat input is `req.ChatRequest.Input []schemas.ChatMessage`
   (`core/schemas/bifrost.go:828-835`). Read text via `msg.Content.ContentStr`; replace via a new
   `&schemas.ChatMessageContent{ContentStr: ptr(s)}`.
2. **The rewrite belongs in `PreRequestHook`, and there is no `PreLLMHook`.** `core/bifrost.go:9827-9856`
   guarantees mutations to any field — including `ChatRequest.Input` — commit and are observed by the
   provider call and every fallback, and the hook runs exactly once. No memo is needed.
3. **No `ExtraFields`.** `BifrostResponseExtraFields` has no generic map and a `.so` cannot add one.
   Decisions go to SQLite; responses carry `x-cc-decision-id` from `HTTPTransportResponseHeadersHook`.
4. **Hook signatures:**
   - `Init(config any) error`
   - `GetName() string`
   - `Cleanup() error`
   - `PreRequestHook(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) error`
   - `PostLLMHook(ctx *schemas.BifrostContext, resp *schemas.BifrostResponse, bifrostErr *schemas.BifrostError) (*schemas.BifrostResponse, *schemas.BifrostError, error)`
   - `HTTPTransportResponseHeadersHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest, resp *schemas.HTTPResponseMetadata) error`
5. **Plugin path must be absolute** (`/plugins/contextcurator.so`); `soloader.go` passes it straight to `plugin.Open`.
6. **Config is `<app-dir>/config.json`**; there is no `-config` flag. Run `bifrost-http -app-dir /data/bifrost -port 8080`.
7. **Relay prefix is `/relay/{name}/{path}`.**
8. **Do not call `make build`** — it depends on `build-ui` and needs node. The dynamic branch is
   `CGO_ENABLED=1 GOWORK=off go build -ldflags="-w -s" -a -trimpath -o /out/bifrost-http .` in
   `transports/bifrost-http`, with no `-extldflags "-static"` and no `sqlite_static` tag.
9. **The mock provider is a custom OpenAI-compatible provider** pointing at a local server. The `mocker`
   plugin cannot be loaded as a `.so` (it does not export the package-level symbols the loader looks up).

## Review Focus

The inputs most likely to break a real user, each pinned by a named test:

1. **User pastes a document into chat.** Must not be segmented or rewritten. → Task 1.2
2. **Tool result with no URL.** Provenance `inferred`; must not be hard-dropped. → Task 1.3, 1.5
3. **Streaming request.** Rewrite completes before the call; stream flag preserved. → Task 1.7
4. **Fallback fires.** Pipeline must not re-run or re-spend credits. → Task 1.7
5. **All Tavily transports fail.** Continue in `annotate` with `refresh_failed`. → Task 1.9
6. **Non-chat endpoint.** Embeddings/speech pass through untouched. → Task 1.5
7. **Mixed URLs in one tool result.** Must not silently collapse two sources into one. → Task 1.3
8. **Empty or single chunk.** No divide-by-zero; no empty rewrite. → Task 1.6

---

# Wave 0 — Container spike (1 day)

**Outcome:** one image that starts Bifrost with a no-op plugin, plus proof of the two load-bearing assumptions. If this wave fails, everything downstream is fiction.

### Task 0.1: Scaffold and pin the toolchain

**Files:**
- Create: `go.work`, `plugin/go.mod`, `sidecar/go.mod`, `.gitattributes`, `.dockerignore`
- Create: `config/bifrost.json`, `config/contextcurator.yaml`

**Steps:**
- [ ] Read `go.mod` in the cloned Bifrost source; record the Go version and `core` version.
- [ ] `plugin/go.mod`: module `github.com/<user>/context-curator/plugin`, `go <version>`, `require github.com/maximhq/bifrost/core <exact>`.
- [ ] `sidecar/go.mod`: same Go version, `require modernc.org/sqlite`.
- [ ] `.gitattributes`: `* text=auto eol=lf`.
- [ ] `.dockerignore`: `**/node_modules`, `**/*.db`, `.git`, `tmp/`.
- [ ] Commit: `chore(cc): scaffold modules and pin toolchain`.

**Gate:** `go mod tidy` succeeds in both modules.

### Task 0.2: Build Bifrost dynamically and load a no-op `.so`

**Files:**
- Create: `plugin/main.go`, `plugin/main_test.go`
- Create: `Dockerfile`

**Interfaces produced:**
```go
func Init(config any) error
func GetName() string
func PreRequestHook(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) error
func PreLLMHook(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) (*schemas.BifrostRequest, *schemas.BifrostError, error)
func PostLLMHook(ctx *schemas.BifrostContext, resp *schemas.BifrostResponse, err *schemas.BifrostError) (*schemas.BifrostResponse, *schemas.BifrostError, error)
func Cleanup() error
```
> Exact signatures are read from `framework/plugins/soplugin.go` and `core/schemas/plugin.go` before writing. Do not guess.

- [ ] **Step 1:** Write the failing test.
```go
func TestGetName(t *testing.T) {
    if got := GetName(); got != "context-curator" { t.Fatalf("GetName() = %q", got) }
}
func TestInitRejectsNil(t *testing.T) {
    if err := Init(nil); err == nil { t.Fatal("expected error") }
}
```
- [ ] **Step 2:** `go test ./... -run TestGetName` → FAIL.
- [ ] **Step 3:** Implement the shell. All hooks return nil / pass through.
- [ ] **Step 4:** Dockerfile stage 1: `make build DYNAMIC=1`, then `go build -buildmode=plugin -o /out/contextcurator.so .`.
- [ ] **Step 5:** `docker build -t cc:spike .` → must succeed.
- [ ] **Step 6:** Run with `plugins` config pointing at `/usr/local/lib/contextcurator.so`; confirm the startup log lists `context-curator` and that Bifrost does not exit.
- [ ] **Step 7:** Commit `feat(cc): no-op plugin loads from dynamic build`.

**Gate:** the `.so` loads. If it does not, stop and fix the toolchain before proceeding.

### Task 0.3: Prove the two load-bearing assumptions

**Files:**
- Modify: `plugin/main.go`
- Create: `plugin/spike_test.go`, `scripts/spike.sh`

- [ ] **Step 1:** `PreLLMHook` appends `[CC-SPIKE]` to the last user message.
- [ ] **Step 2:** Send a request through the container to the mock provider. Assert the provider received the marker.
  - **Proves:** `PreLLMHook` can mutate `req.Input` and the mutation reaches the provider.
- [ ] **Step 3:** `PostLLMHook` sets `resp.ExtraFields["cc_spike"] = "ok"`.
- [ ] **Step 4:** Assert the marker appears in the client's HTTP response.
  - **Proves:** `ExtraFields` survives the HTTP transport.
- [ ] **Step 5:** Fire a request that forces a fallback. Assert `PreLLMHook` ran twice and the memo path was taken the second time.
  - **Proves:** the memo design is necessary and correct.
- [ ] **Step 6:** Commit `test(cc): prove hook mutation, extra fields, and fallback re-entry`.

**Gate:** all three proven. If Step 4 fails, the UI reads decisions from SQLite instead and `ExtraFields` becomes a bonus.

### Task 0.4: One container, three processes

**Files:**
- Create: `sidecar/main.go`, `supervisord.conf`, `docker-entrypoint.sh`
- Modify: `Dockerfile`

- [ ] **Step 1:** Sidecar stub: `GET /healthz` → `{"ok":true}` on `:8090`.
- [ ] **Step 2:** `supervisord.conf` with two programs, `autorestart=true`, logs to stdout.
- [ ] **Step 3:** `docker run -p 8080:8080 -p 8090:8090 cc:spike`; both `/healthz` and `/v1/models` respond.
- [ ] **Step 4:** `docker stop` exits cleanly in under 5 s.
- [ ] **Step 5:** Commit `feat(cc): single-container runtime with supervisord`.

**Wave 0 gate:** `docker run` on a clean machine starts Bifrost + plugin + sidecar; `curl localhost:8090/healthz` is green; `curl localhost:8080/v1/models` returns a model list.

---

# Wave 1 — Admission (4 days)

**Outcome:** the gateway rewrites context deterministically, with reason codes, and refreshes stale sources through Tavily inside a credit budget.

### Task 1.1: Config schema, defaults, and decision types

**Files:** `plugin/config.go`, `plugin/types.go`, `plugin/config_test.go`, `plugin/types_test.go`, `plugin/testdata/config_*.yaml`

**Interfaces:**
```go
type Config struct{ ... }
func DefaultConfig() *Config
func ParseConfig(raw any) (*Config, error)
func (c *Config) Validate() error

type Chunk struct{ ... }
type Decision struct{ ... }
type DropReason struct{ ID, Reason string }
func (d Decision) Validate() error
```

- [ ] **Step 1:** Failing tests.
```go
func TestDefaults(t *testing.T) {
    c, err := ParseConfig(map[string]any{"enabled": true})
    if err != nil { t.Fatal(err) }
    if c.Mode != ModeAnnotate { t.Fatalf("mode = %q", c.Mode) }
    if c.Budget.MaxContextTokens != 4000 { t.Fatalf("budget = %d", c.Budget.MaxContextTokens) }
}
func TestRejectsUnknownMode(t *testing.T) {
    c := DefaultConfig(); c.Mode = "destroy"
    if c.Validate() == nil { t.Fatal("expected error") }
}
func TestEveryDropNeedsAReason(t *testing.T) {
    d := Decision{ChunksIn: 2, ChunksKept: 1, Dropped: []DropReason{{ID: "c2"}}}
    if d.Validate() == nil { t.Fatal("expected error") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. Reason codes: `stale`, `duplicate_of:<id>`, `authority_denied`, `low_relevance`, `over_budget`, `policy_min_sources`, `refresh_failed`, `provenance_unknown`.
- [ ] **Step 4:** PASS. Commit `feat(cc): config, types, reason codes`.

### Task 1.2: Token counter and segmenter with a prose guard

**Files:** `plugin/tokens.go`, `plugin/segmenter.go`, `*_test.go`, `plugin/testdata/request_*.json`

**Interfaces:**
```go
type TokenCounter struct{}
func NewTokenCounter() *TokenCounter
func (t *TokenCounter) Count(s string) int
func (t *TokenCounter) Method() string   // "tokenizer" | "estimate"

func Segment(req *schemas.BifrostRequest) ([]Chunk, error)
```

- [ ] **Step 1:** Failing tests.
```go
func TestSegmentOnlyToolMessages(t *testing.T) {
    chunks, err := Segment(loadRequest(t, "testdata/request_tool.json"))
    if err != nil { t.Fatal(err) }
    if len(chunks) != 3 { t.Fatalf("chunks = %d", len(chunks)) }
}
func TestSegmentIgnoresUserProse(t *testing.T) {
    chunks, _ := Segment(loadRequest(t, "testdata/request_prose.json"))
    for _, c := range chunks {
        if c.Role == "user" { t.Fatalf("user prose segmented: %s", c.ID) }
    }
}
func TestCountIsDeterministic(t *testing.T) {
    c := NewTokenCounter()
    if c.Count("a b c") != c.Count("a b c") || c.Method() == "" { t.Fatal("unstable") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Walk chat messages; take `role: tool` content only. `ID = "c" + index`. Return empty slice (not error) when nothing to segment. Tokenizer falls back to `ceil(len(runes)/4)` and reports `estimate`.
- [ ] **Step 4:** PASS. Commit `feat(cc): segmenter with prose guard`.

### Task 1.3: Context blocks and provenance

**Files:** `plugin/provenance.go`, `plugin/provenance_test.go`, `plugin/testdata/tool_result_*.json`

**Interfaces:**
```go
func ExtractProvenance(c Chunk, now time.Time) Chunk
func NormalizeDomain(rawurl string) (string, error)
```

- [ ] **Step 1:** Failing tests.
```go
func TestKnownFromURL(t *testing.T) {
    got := ExtractProvenance(Chunk{Text: "see https://docs.example.com/pricing"}, time.Now())
    if got.Domain != "docs.example.com" || got.Provenance != ProvenanceKnown { t.Fatalf("%+v", got) }
}
func TestInferredWithoutURL(t *testing.T) {
    got := ExtractProvenance(Chunk{Text: "no links"}, time.Now())
    if got.Provenance != ProvenanceInferred { t.Fatalf("%+v", got) }
}
func TestMultiURLDoesNotCollapse(t *testing.T) {
    got := ExtractProvenance(Chunk{Text: "https://a.example.com/x and https://b.example.com/y"}, time.Now())
    if len(got.SourceURLs) != 2 { t.Fatalf("urls = %v", got.SourceURLs) }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Extract all absolute URLs. `FetchedAt` from tool metadata when present, else `now`. `ContentHash` over whitespace-normalised text. `Provenance = known` iff ≥1 URL. Also parse `<context>` tags in system messages only, preserving order.
- [ ] **Step 4:** PASS. Commit `feat(cc): context blocks and provenance`.

### Task 1.4: Deterministic scorer

**Files:** `plugin/scorer.go`, `plugin/scorer_test.go`

**Interfaces:**
```go
type ScoreInput struct {
    Now            time.Time
    FreshnessClass string
    Utility        func(domain string) float64
}
func Score(c Chunk, in ScoreInput) Chunk
func AuthorityWeight(t AuthorityTier) float64
```

- [ ] **Step 1:** Failing tests.
```go
func TestFreshnessDecays(t *testing.T) {
    now := time.Now()
    a := Score(Chunk{FetchedAt: now}, ScoreInput{Now: now, FreshnessClass: "price"})
    b := Score(Chunk{FetchedAt: now.Add(-48 * time.Hour)}, ScoreInput{Now: now, FreshnessClass: "price"})
    if a.Freshness <= b.Freshness { t.Fatalf("fresh=%f old=%f", a.Freshness, b.Freshness) }
}
func TestIndependenceInvertsClusterSize(t *testing.T) {
    a := Score(Chunk{ClusterSize: 1}, ScoreInput{Now: time.Now()})
    b := Score(Chunk{ClusterSize: 4}, ScoreInput{Now: time.Now()})
    if a.Independence <= b.Independence { t.Fatal("not inverted") }
}
func TestScoreIsDeterministic(t *testing.T) {
    c := Chunk{ContentHash: "abc", FetchedAt: time.Unix(0, 0)}
    in := ScoreInput{Now: time.Unix(1000, 0)}
    if Score(c, in).Score != Score(c, in).Score { t.Fatal("non-deterministic") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Weights 0.35/0.20/0.20/0.15/0.10. Freshness `exp(-age/halfLife)`. Independence `1/max(size,1)`. Round to 6 dp.
- [ ] **Step 4:** PASS. Commit `feat(cc): deterministic scorer`.

### Task 1.5: Policy resolution and hard denies

**Files:** `plugin/policy.go`, `plugin/policy_test.go`, `plugin/testdata/policy_support.yaml`

**Interfaces:**
```go
func ResolvePolicy(cfg *Config, virtualKey, route string) Policy
func (p Policy) Admit(c Chunk) (bool, string)
func (p Policy) IsChatEndpoint(path string) bool
```

- [ ] **Step 1:** Failing tests.
```go
func TestVirtualKeyWins(t *testing.T) {
    p := ResolvePolicy(loadConfig(t, "testdata/policy_support.yaml"), "support-bot", "chat")
    if p.Name != "support-bot" { t.Fatalf("policy = %q", p.Name) }
}
func TestDeniedDomainDropped(t *testing.T) {
    p := Policy{Deny: []string{"farm.example"}}
    ok, reason := p.Admit(Chunk{Domain: "farm.example", Provenance: ProvenanceKnown})
    if ok || reason != ReasonAuthorityDenied { t.Fatalf("%v %q", ok, reason) }
}
func TestInferredNotHardDropped(t *testing.T) {
    p := Policy{Deny: []string{"farm.example"}}
    if ok, _ := p.Admit(Chunk{Domain: "farm.example", Provenance: ProvenanceInferred}); !ok {
        t.Fatal("inferred provenance must not hard-drop")
    }
}
func TestEmbeddingsPassThrough(t *testing.T) {
    if (Policy{}).IsChatEndpoint("/v1/embeddings") { t.Fatal("treated as chat") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Resolution order virtual key → route → default. Hard deny only when provenance is `known`. Non-chat paths skipped.
- [ ] **Step 4:** PASS. Commit `feat(cc): policy resolution and hard denies`.

### Task 1.6: Clustering and MMR selection

**Files:** `plugin/cluster.go`, `plugin/selector.go`, `*_test.go`

**Interfaces:**
```go
func Jaccard(a, b string) float64
func Cluster(chunks []Chunk, threshold float64) []Chunk
func Select(chunks []Chunk, budget, minSources int, lambda float64) ([]Chunk, []DropReason)
```

- [ ] **Step 1:** Failing tests.
```go
func TestClusterCollapses(t *testing.T) {
    got := Cluster([]Chunk{
        {ID: "c1", Text: "The price is 49 dollars per seat per month"},
        {ID: "c2", Text: "The price is 49 dollars per seat each month"},
        {ID: "c3", Text: "Refunds within 30 days"},
    }, 0.8)
    if len(got) != 2 || got[0].ClusterSize != 2 { t.Fatalf("clusters=%d size=%d", len(got), got[0].ClusterSize) }
}
func TestSelectRespectsBudget(t *testing.T) {
    kept, dropped := Select(fixtureChunks(10, 500), 1600, 1, 0.7)
    if totalTokens(kept) > 1600 || len(dropped) != 10-len(kept) { t.Fatal("budget violated") }
}
func TestSelectEmpty(t *testing.T) {
    if k, d := Select(nil, 100, 1, 0.7); len(k) != 0 || len(d) != 0 { t.Fatal("expected empty") }
}
func TestSelectHonorsMinSources(t *testing.T) {
    kept, _ := Select(fixtureChunks(3, 500), 400, 2, 0.7)
    if distinctClusters(kept) < 2 { t.Fatal("min sources ignored") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** 3-shingle Jaccard, union-find, deterministic first-seen order. Representative = highest authority → highest freshness → lowest hash. Greedy MMR; force-add per missing cluster when `min_sources` unmet.
- [ ] **Step 4:** PASS. Commit `feat(cc): clustering and MMR selection`.

### Task 1.7: Rewriter, hook wiring, and the fallback memo

**Files:** `plugin/rewriter.go`, `plugin/main.go`, `plugin/flow_test.go`

**Interfaces:**
```go
func Rewrite(req *schemas.BifrostRequest, kept []Chunk) error
func (p *Plugin) handle(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) (*Decision, error)
```

- [ ] **Step 1:** Failing tests.
```go
func TestRewriteKeepsOrderAndToolIDs(t *testing.T) {
    req := loadRequest(t, "testdata/request_tool.json")
    if err := Rewrite(req, []Chunk{{ID: "c1", Text: "a"}, {ID: "c3", Text: "c"}}); err != nil { t.Fatal(err) }
    assertToolContents(t, req, []string{"a", "c"})
    assertToolIDsPreserved(t, req)
}
func TestRewriteAppendsSourceList(t *testing.T) {
    req := loadRequest(t, "testdata/request_tool.json")
    _ = Rewrite(req, []Chunk{{ID: "c1", Text: "a", SourceURLs: []string{"https://x.example"}}})
    if !contains(t, req, "https://x.example") { t.Fatal("missing source list") }
}
func TestStreamingFlagPreserved(t *testing.T) {
    req := loadRequest(t, "testdata/request_tool_stream.json")
    p := newTestPlugin(t)
    if _, err := p.handle(testCtx(), req); err != nil { t.Fatal(err) }
    if req.Stream == nil || !*req.Stream { t.Fatal("stream flag lost") }
}
func TestFallbackDoesNotRerunPipeline(t *testing.T) {
    p := newTestPlugin(t); ctx := testCtx(); req := loadRequest(t, "testdata/request_tool.json")
    _, _ = p.handle(ctx, req)
    calls := p.spy.Calls()
    _, _ = p.handle(ctx, req)          // simulates a second attempt
    if p.spy.Calls() != calls { t.Fatal("pipeline re-ran on fallback") }
}
func TestEmptyContextPassesThrough(t *testing.T) {
    req := loadRequest(t, "testdata/request_prose.json")
    p := newTestPlugin(t); before := snapshot(t, req)
    _, _ = p.handle(testCtx(), req)
    assertUnchanged(t, before, req)
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Replace tool contents in place, preserve roles and tool call IDs, append a `[context-curator sources]` system message. Memoise `{decision, rewritten}` on `ctx` keyed by request ID. `PreRequestHook` resolves policy and reserves credits; `PreLLMHook` calls `handle`; `PostLLMHook` writes `ExtraFields`.
- [ ] **Step 4:** PASS. Commit `feat(cc): hook pipeline with fallback memo`.

### Task 1.8: Tavily retriever chain

**Files:** `plugin/retriever/{retriever,chain,http,relay}.go` + tests

**Interfaces:**
```go
type Result struct{ URL, Content, RawContent string; Credits int }
type Query struct{ Text string; MaxAgeHours int; SearchDepth string; IncludeDomains []string; MaxResults int }
type Retriever interface {
    Name() string
    Search(ctx context.Context, q Query) ([]Result, error)
    Extract(ctx context.Context, urls []string, q string) ([]Result, error)
}
func NewChain(order []string, rs map[string]Retriever) *Chain
func (c *Chain) Search(ctx context.Context, q Query) ([]Result, string, error)
```

- [ ] **Step 1:** Failing tests.
```go
func TestChainFallsBack(t *testing.T) {
    c := NewChain([]string{"relay", "http"}, map[string]Retriever{
        "relay": fakeRetriever{err: errors.New("down")},
        "http":  fakeRetriever{results: []Result{{URL: "https://x"}}},
    })
    res, used, err := c.Search(context.Background(), Query{Text: "q"})
    if err != nil || used != "http" || len(res) != 1 { t.Fatalf("%v %q %d", err, used, len(res)) }
}
func TestHTTPSendsMaxAge(t *testing.T) {
    var body map[string]any
    srv := httptest.NewServer(jsonServer(&body, `{"results":[{"url":"https://x","content":"c"}],"usage":{"credits":1}}`))
    defer srv.Close()
    _, err := NewHTTP(srv.URL, "k", srv.Client()).Search(context.Background(), Query{Text: "q", MaxAgeHours: 24})
    if err != nil || body["max_age_hours"] != float64(24) { t.Fatalf("%v %v", err, body) }
}
func TestRelayUsesRelayPath(t *testing.T) {
    var got string
    srv := httptest.NewServer(pathRecorder(&got, `{"results":[]}`))
    defer srv.Close()
    _, _ = NewRelay(srv.URL, "tavily", srv.Client()).Search(context.Background(), Query{Text: "q"})
    if got != "/relay/tavily/search" { t.Fatalf("path = %q", got) }
}
func TestAllTransportsFail(t *testing.T) {
    c := NewChain([]string{"relay"}, map[string]Retriever{"relay": fakeRetriever{err: errors.New("down")}})
    if _, _, err := c.Search(context.Background(), Query{Text: "q"}); err == nil { t.Fatal("expected error") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Sequential attempts with per-attempt timeout; never retry a transport twice; return the transport that served. Direct HTTP: bearer auth, `POST /search` and `/extract`. Relay: `/relay/<name>/search`, no auth header.
- [ ] **Step 4:** PASS. Commit `feat(cc): Tavily retriever chain`.

### Task 1.9: Freshness refresh and credit budget

**Files:** `plugin/freshness.go`, `plugin/freshness_test.go`

**Interfaces:**
```go
type CreditBudget struct{}
func NewCreditBudget(max int) *CreditBudget
func (b *CreditBudget) Spent() int
func (b *CreditBudget) Take(n int) bool

func Refresh(ctx context.Context, chunks []Chunk, p Policy, r Retriever, b *CreditBudget) ([]Chunk, []DropReason)
```

- [ ] **Step 1:** Failing tests.
```go
func TestRefreshOnlyStale(t *testing.T) {
    now := time.Now()
    chunks := []Chunk{
        {ID: "c1", FetchedAt: now, FreshnessClass: "price"},
        {ID: "c2", FetchedAt: now.Add(-72 * time.Hour), FreshnessClass: "price", SourceURLs: []string{"https://x"}},
    }
    got, _ := Refresh(context.Background(), chunks, testPolicy(), fakeRetriever{}, NewCreditBudget(2))
    if got[0].Refreshed { t.Fatal("fresh chunk refreshed") }
    if !got[1].Refreshed { t.Fatal("stale chunk not refreshed") }
}
func TestBudgetEnforced(t *testing.T) {
    b := NewCreditBudget(1)
    _, _ = Refresh(context.Background(), staleChunks(5), testPolicy(), fakeRetriever{}, b)
    if b.Spent() > 1 { t.Fatalf("spent = %d", b.Spent()) }
}
func TestFailureDegradesNotDrops(t *testing.T) {
    got, dropped := Refresh(context.Background(), staleChunks(1), testPolicy(), failingRetriever{}, NewCreditBudget(2))
    if len(got) != 1 || !got[0].RefreshFailed || len(dropped) != 0 { t.Fatalf("%+v %v", got, dropped) }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** For each stale chunk with a known URL: search, extract the top result, replace text, update hash and `FetchedAt`, mark `Refreshed`. Stop at budget. Transport failure ⇒ `RefreshFailed`, never a drop.
- [ ] **Step 4:** PASS. Commit `feat(cc): freshness refresh with credit budget`.

**Wave 1 gate:** a fixture request loses its duplicate and stale chunks, keeps the authoritative one, records a reason for every drop, and the response carries a decision.

---

# Wave 2 — Proof and learning (3 days)

**Outcome:** decisions persist, reputation is shared across apps, and any chunk's causal influence can be proven.

### Task 2.1: SQLite store and recorder

**Files:** `plugin/store/sqlite.go`, `plugin/recorder.go`, `*_test.go`

**Interfaces:**
```go
func Open(path string) (*Store, error)
func (s *Store) InsertDecision(ctx context.Context, d Decision, req string) error
func (s *Store) GetDecision(ctx context.Context, id string) (Decision, string, error)
func (s *Store) RecentDecisions(ctx context.Context, limit int) ([]Decision, error)
func (s *Store) Close() error
```

- [ ] **Step 1:** Failing test.
```go
func TestDecisionRoundTrip(t *testing.T) {
    s, err := Open(filepath.Join(t.TempDir(), "t.db")); if err != nil { t.Fatal(err) }; defer s.Close()
    d := Decision{RequestID: "r1", ChunksIn: 3, ChunksKept: 1}
    if err := s.InsertDecision(context.Background(), d, `{"redacted":true}`); err != nil { t.Fatal(err) }
    got, _, err := s.GetDecision(context.Background(), "r1")
    if err != nil || got.ChunksIn != 3 { t.Fatalf("%v %+v", err, got) }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `modernc.org/sqlite`, WAL, `busy_timeout=5000`, schema from ARCHITECTURE §13. `PostLLMHook` writes the decision after attaching `ExtraFields`.
- [ ] **Step 4:** PASS. Commit `feat(cc): sqlite store and decision recorder`.

### Task 2.2: Reputation and cross-app learning

**Files:** `plugin/reputation.go`, `plugin/reputation_test.go`, `sidecar/reputation.go`

**Interfaces:**
```go
func Utility(r Reputation) float64
func Decay(r Reputation, now time.Time) Reputation
func Apply(r Reputation, positive bool) Reputation
```

- [ ] **Step 1:** Failing tests.
```go
func TestPositiveMovesPosterior(t *testing.T) {
    r := Reputation{Alpha: 1, Beta: 1}
    if Utility(Apply(r, true)) <= Utility(r) { t.Fatal("no movement") }
}
func TestDecayPullsToPrior(t *testing.T) {
    r := Reputation{Alpha: 100, Beta: 1, LastSeen: time.Now().Add(-30 * 24 * time.Hour)}
    if Decay(r, time.Now()).Alpha >= r.Alpha { t.Fatal("no decay") }
}
func TestCrossAppSharedTable(t *testing.T) {
    s := openTestStore(t)
    setReputation(t, s, "farm.example", Reputation{Alpha: 1, Beta: 9})
    p := newTestPluginWithStore(t, s)
    if p.utilityFor("farm.example") > 0.3 { t.Fatal("app did not inherit reputation") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `α+1` / `β+1`, cap 10,000, decay `0.99/day` toward prior. One table, all apps. Per-request cache in the scorer.
- [ ] **Step 4:** PASS. Commit `feat(cc): cross-app source reputation`.

### Task 2.3: Sidecar API and UI shell

**Files:** `sidecar/main.go`, `sidecar/api.go`, `sidecar/store.go`, `sidecar/api_test.go`

**Interfaces:** the endpoints in ARCHITECTURE §14.

- [ ] **Step 1:** Failing test.
```go
func TestDecisionsEndpoint(t *testing.T) {
    s := newTestServer(t)
    w := httptest.NewRecorder()
    s.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/context-curator/decisions", nil))
    if w.Code != 200 || !strings.Contains(w.Body.String(), "chunks_in") { t.Fat("%d %s", w.Code, w.Body.String()) }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `net/http` mux, bearer token from `CC_ADMIN_TOKEN`, static file server for `/srv/web`. JSON error envelope.
- [ ] **Step 4:** PASS. Commit `feat(cc): sidecar API and UI shell`.

### Task 2.4: Replayer with bypass

**Files:** `sidecar/replayer.go`, `sidecar/replayer_test.go`

**Interfaces:**
```go
type Replayer interface {
    Replay(ctx context.Context, req string, dropChunk string) (string, error)
}
func NewGatewayReplayer(baseURL, adminToken string) *GatewayReplayer
```

- [ ] **Step 1:** Failing test.
```go
func TestReplayerRemovesOnlyTargetChunk(t *testing.T) {
    var seen string
    srv := captureProvider(&seen)
    defer srv.Close()
    r := NewGatewayReplayer(srv.URL, "tok")
    _, err := r.Replay(context.Background(), loadRecordedRequest(t, "testdata/request_tool.json"), "c2")
    if err != nil { t.Fatal(err) }
    if strings.Contains(seen, "chunk-two") { t.Fatal("target survived") }
    if !strings.Contains(seen, "chunk-one") { t.Fatal("collateral removal") }
}
func TestReplaySetsBypassAndZeroTemp(t *testing.T) {
    // asserts header x-cc-bypass: 1 and temperature 0
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Clone the recorded request, strip the target chunk's text, set `temperature: 0`, send `x-cc-bypass: 1` so the plugin does not re-curate. Concatenate the response text.
- [ ] **Step 4:** PASS. Commit `feat(cc): counterfactual replayer with bypass`.

### Task 2.5: Sentence diff and influence

**Files:** `sidecar/diff.go`, `sidecar/diff_test.go`

**Interfaces:**
```go
type Diff struct{ Changed, Added, Removed []string; Total int }
func SentenceDiff(a, b string) Diff
func Influence(d Diff) float64
```

- [ ] **Step 1:** Failing tests.
```go
func TestDiffFindsChange(t *testing.T) {
    d := SentenceDiff("The price is 49 dollars. Refunds take 30 days.", "The price is 79 dollars. Refunds take 30 days.")
    if len(d.Changed) != 1 || Influence(d) <= 0 { t.Fatalf("%+v %f", d, Influence(d)) }
}
func TestIdenticalIsZero(t *testing.T) {
    if Influence(SentenceDiff("same.", "same.")) != 0 { t.Fatal("expected 0") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Sentence split, whitespace/case normalise, LCS align, `influence = changed / total`.
- [ ] **Step 4:** PASS. Commit `feat(cc): sentence diff and influence`.

### Task 2.6: Autopsy orchestration

**Files:** `sidecar/autopsy.go`, `sidecar/autopsy_test.go`

**Interfaces:**
```go
type AutopsyRequest struct{ RequestID, ChunkID string }
type AutopsyResult struct{ Influence float64; Diff Diff; With, Without string; Cached bool }
func (s *Server) Autopsy(ctx context.Context, req AutopsyRequest) (*AutopsyResult, error)
```

- [ ] **Step 1:** Failing tests.
```go
func TestRejectsUnknownChunk(t *testing.T) {
    if _, err := newTestServer(t).Autopsy(context.Background(), AutopsyRequest{"r1", "nope"}); err == nil { t.Fatal("expected error") }
}
func TestCachesResult(t *testing.T) {
    s := newTestServer(t); s.replayer = &countingReplayer{}
    a, _ := s.Autopsy(context.Background(), AutopsyRequest{"r1", "c1"})
    b, _ := s.Autopsy(context.Background(), AutopsyRequest{"r1", "c1"})
    if s.replayer.(*countingReplayer).Calls() != 2 { t.Fatal("cache miss") }
    if a.Influence != b.Influence { t.Fatal("unstable") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Validate, check cache, replay twice, diff, store, return. Max 5 ablations per call, 60-minute TTL.
- [ ] **Step 4:** PASS. Commit `feat(cc): autopsy orchestration and cache`.

### Task 2.7: Claim freshness (Tavily theme)

**Files:** `sidecar/claims.go`, `sidecar/claims_test.go`

**Interfaces:**
```go
type Claim struct{ Text string; Source string; Freshness float64; Evidence []string }
func ExtractClaims(ctx context.Context, text string, llm ClaimLLM) ([]string, error)
func ScoreClaims(ctx context.Context, claims []string, r retriever.Retriever) ([]Claim, error)
```

- [ ] **Step 1:** Failing test.
```go
func TestClaimFreshnessUsesEvidence(t *testing.T) {
    c, err := ScoreClaims(context.Background(), []string{"Pro plan is $49"}, fakeRetriever{})
    if err != nil || len(c) != 1 || c[0].Freshness <= 0 || c[0].Freshness > 1 { t.Fatalf("%v %+v", err, c) }
}
func TestClaimsCachedByHash(t *testing.T) { /* second call hits cache, retriever count unchanged */ }
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** LLM claim extraction (cached by content hash), Tavily search per claim with `max_age_hours`, similarity → freshness. Skip cleanly when disabled or the model is unavailable.
- [ ] **Step 4:** PASS. Commit `feat(cc): per-claim freshness scoring`.

**Wave 2 gate:** `curl` an autopsy for a recorded request and get an influence score plus a sentence diff in under 10 s; a feedback event on a domain changes the next request's selection and survives a restart.

---

# Wave 3 — Evidence (3 days)

**Outcome:** three apps, a measured before/after, a UI a judge can click, and a submission.

### Task 3.1: Three demo apps and the seed corpus

**Files:** `examples/apps/{support,docs,research}/main.go`, `examples/seed/pages/*.md`, `examples/docker-compose.apps.yml`

- [ ] **Step 1:** Failing test.
```go
func TestSupportAnswersPricing(t *testing.T) {
    if got := ask(t, supportURL, "How much is Pro?"); !strings.Contains(got, "$") { t.Fatalf("answer = %q", got) }
}
```
- [ ] **Step 2:** FAIL (nothing running).
- [ ] **Step 3:** Each app sends a chat request whose tool result contains seeded pages: an authoritative pricing page, a stale blog post with a different price, four near-duplicate press releases, and one denied domain. All point at `localhost:8080`.
- [ ] **Step 4:** PASS. Commit `feat(cc): three demo apps and seed corpus`.

### Task 3.2: Eval harness and measured results

**Files:** `examples/eval/questions.jsonl`, `examples/eval/main.go`, `examples/eval/results.md`

- [ ] **Step 1:** Failing test.
```go
func TestEvalProducesRows(t *testing.T) {
    rows := runEval(t, "questions.jsonl", 3)
    if len(rows) != 50 { t.Fatalf("rows = %d", len(rows)) }
    if rows[0].AccuracyRaw == 0 && rows[0].AccuracyCurated == 0 { t.Fatal("no measurements") }
}
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Each question runs twice (curator off/on), three repeats; score against the key; record tokens, cost, latency. Emit a markdown table.
- [ ] **Step 4:** `go run ./examples/eval > examples/eval/results.md`. Commit `test(cc): eval harness and measured results`.

### Task 3.3: Decision drawer

**Files:** `web/src/components/DecisionDrawer.tsx`, `web/src/api.ts`, `web/src/types.ts`

- [ ] **Step 1:** Failing test.
```tsx
it("renders a reason for every dropped chunk", () => {
  render(<DecisionDrawer decision={fixture} />);
  expect(screen.getAllByTestId("drop-reason")).toHaveLength(fixture.dropped.length);
});
```
- [ ] **Step 2:** `npm test -- DecisionDrawer` → FAIL.
- [ ] **Step 3:** Table of chunks, kept/dropped badges, reason text, token delta, freshness, per-claim badges, link to autopsy.
- [ ] **Step 4:** PASS. Commit `feat(cc): decision drawer`.

### Task 3.4: Context page and autopsy panel

**Files:** `web/src/pages/{Requests,Sources}.tsx`, `web/src/components/{AutopsyPanel,SentenceDiff}.tsx`

- [ ] **Step 1:** Failing tests.
```tsx
it("lists domains with utility scores", async () => {
  render(<Sources rows={fixtureRows} />);
  expect(await screen.findByText("docs.example.com")).toBeInTheDocument();
});
it("highlights changed sentences", () => {
  render(<SentenceDiff diff={fixtureDiff} />);
  expect(screen.getAllByTestId("changed-sentence")).toHaveLength(fixtureDiff.changed.length);
});
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Requests tab (savings, freshness, drill-in) and Sources tab (reputation, reset). Autopsy button → loading → side-by-side with highlights and influence score.
- [ ] **Step 4:** PASS. Commit `feat(cc): context page and autopsy panel`.

### Task 3.5: README and setup

**Files:** `README.md`, `docs/SETUP.md`

- [ ] **Step 1:** Cover: what it is, the one-liner, the 90-second demo, `docker run`, config, policy, API, eval command, measured numbers, Bifrost integration, Tavily integration, PR shape.
- [ ] **Step 2:** Run every command on a clean checkout. Fix what fails.
- [ ] **Step 3:** Commit `docs(cc): readme and setup guide`.

### Task 3.6: Video, deck, submission

**Files:** `docs/demo/storyboard.md`, `docs/deck/outline.md`, `docs/SUBMISSION.md`

- [ ] **Step 1:** Storyboard the five acts with timings and on-screen text.
- [ ] **Step 2:** Record under 90 s. Watch with sound off; if the story does not land, re-record.
- [ ] **Step 3:** Deck: problem, demo still, architecture, measured table, Bifrost fit, Tavily fit, PR shape.
- [ ] **Step 4:** Checklist: repo public, README, tests pass, video, deck, primary theme = Bifrost, Tavily checkbox = yes.
- [ ] **Step 5:** Commit `docs(cc): storyboard, deck, submission checklist`.

**Wave 3 gate:** a stranger clones the repo, runs the image, runs the eval, and reproduces the numbers in the deck.

---

# Wave 4 — Buffer (1 day)

### Task 4.1: Hardening

- [ ] Panic recovery around every hook.
- [ ] `docker run` with no `OPENAI_API_KEY` starts and reports a clear error instead of crashing.
- [ ] Image builds from a clean clone in under 10 minutes.
- [ ] `docker stop` under 5 s; SQLite checkpointed.
- [ ] README numbers re-verified against `eval/results.md`.

### Task 4.2: Publish

- [ ] `docker tag` + push to GHCR.
- [ ] Tag the release `v1.0.0`.
- [ ] Open the upstream PR draft against `maximhq/bifrost` adding `plugins/context-curator/`.

---

## Execution order and cut lines

| Wave | Days | If it slips |
|---|---|---|
| 0 Spike | 1 | Nothing ships without it. Do not proceed until the `.so` loads. |
| 1 Admission | 4 | Cut context-block parsing (tool messages only). Cut the relay (HTTP only). Keep reason codes. |
| 2 Proof + learning | 3 | Cut claim freshness first. Autopsy is non-negotiable. |
| 3 Evidence | 3 | Cut the Sources tab. Never cut the eval table or the video. |
| 4 Buffer | 1 | Absorbs everything above. |

**Absolute cut order:** claim freshness → relay transport → context blocks → Sources tab → cross-app decay → MMR (replace with score-sort) → second and third demo app.

**Never cut:** the autopsy, the eval table, the reason codes, the one-container image, the video.

---

## Self-review

**Requirement coverage:** FR-1 → 1.2/1.3; FR-2 → 1.3; FR-3 → 1.4; FR-4 → 1.5; FR-5 → 1.9; FR-6 → 1.6; FR-7 → 1.7; FR-8 → 2.1; FR-9 → 2.7; FR-10 → 2.4–2.6; FR-11 → 2.2; FR-12 → 3.3/3.4; FR-13 → 1.1. Deployment requirement → 0.4.

**Review focus:** each of the eight risky inputs has a named test in the task that owns the code.

**Type consistency:** `Chunk`, `Decision`, `DropReason`, `Policy`, `Reputation` are defined once (Task 1.1) and referenced by name thereafter. `Retriever`/`Query`/`Result` defined in 1.8 and reused by 1.9 and 2.7.

**Assumption risk:** Tasks 0.2 and 0.3 exist to falsify the two assumptions that would invalidate the architecture. If either fails, stop and revise before Wave 1.
