package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/maximhq/bifrost/core/schemas"

	"github.com/athmabhiram/context-curator/plugin/store"
)

// sourceListHeader heads the appended system message that cites every kept
// source, so the model answer can attribute claims to retrieved URLs.
const sourceListHeader = "[context-curator sources]"

// Rewrite replaces tool message contents in place with the kept chunk texts,
// paired positionally: kept[k] lands in the k-th tool message. Roles and
// tool call IDs are preserved; tool messages beyond the kept set are removed.
// A system source-list message is appended when kept chunks cite URLs.
// Requests without tool messages pass through untouched.
func Rewrite(req *schemas.BifrostRequest, kept []Chunk) error {
	if req == nil || req.ChatRequest == nil {
		return nil
	}
	var toolIdx []int
	for i, msg := range req.ChatRequest.Input {
		if msg.Role == schemas.ChatMessageRoleTool {
			toolIdx = append(toolIdx, i)
		}
	}
	if len(toolIdx) == 0 {
		return nil
	}
	paired := len(kept)
	if paired > len(toolIdx) {
		paired = len(toolIdx)
	}
	for k := 0; k < paired; k++ {
		req.ChatRequest.Input[toolIdx[k]].Content = &schemas.ChatMessageContent{
			ContentStr: ptr(kept[k].Text),
		}
	}
	if len(toolIdx) > len(kept) {
		drop := map[int]bool{}
		for _, i := range toolIdx[len(kept):] {
			drop[i] = true
		}
		msgs := req.ChatRequest.Input[:0]
		for i, msg := range req.ChatRequest.Input {
			if !drop[i] {
				msgs = append(msgs, msg)
			}
		}
		// Nil the tail so dropped messages cannot leak via the backing array.
		for i := len(msgs); i < len(req.ChatRequest.Input); i++ {
			req.ChatRequest.Input[i] = schemas.ChatMessage{}
		}
		req.ChatRequest.Input = msgs
	}
	urls := []string{}
	seen := map[string]bool{}
	for _, c := range kept {
		for _, u := range c.SourceURLs {
			if !seen[u] {
				seen[u] = true
				urls = append(urls, u)
			}
		}
	}
	if len(urls) > 0 {
		var b strings.Builder
		b.WriteString(sourceListHeader + "\n")
		for _, u := range urls {
			b.WriteString("- " + u + "\n")
		}
		req.ChatRequest.Input = append(req.ChatRequest.Input, schemas.ChatMessage{
			Role:    schemas.ChatMessageRoleSystem,
			Content: &schemas.ChatMessageContent{ContentStr: ptr(b.String())},
		})
	}
	return nil
}

// lambdaMMR is the relevance-vs-redundancy trade-off for selection.
const lambdaMMR = 0.7

// pipeline runs the admission chain for one request. Constructed per hook
// call from the active plugin config; stateless across requests.
type pipeline struct {
	cfg *Config
	// store backs utility lookups; nil (tests, unconfigured sidecar) means
	// every domain scores the prior 0.5.
	store *store.Store
	// utilities caches posterior means per domain for the request, so each
	// domain hits SQLite at most once.
	utilities map[string]float64
}

func newPipeline(cfg *Config) *pipeline {
	if cfg == nil {
		cfg = DefaultConfig()
	}
	return &pipeline{cfg: cfg, utilities: map[string]float64{}}
}

// utilityFor returns the cached posterior mean for a domain, loading it from
// the store on first use. No store, an unknown domain, or a store error all
// degrade to the prior 0.5; a denied domain scores 0.0.
func (p *pipeline) utilityFor(domain string) float64 {
	if cached, ok := p.utilities[domain]; ok {
		return cached
	}
	if p.store == nil {
		return 0.5
	}
	rep, err := p.store.GetReputation(context.Background(), domain)
	if err != nil {
		if p.utilities == nil {
			p.utilities = map[string]float64{}
		}
		if errors.Is(err, store.ErrNotFound) {
			p.utilities[domain] = 0.5
		}
		return 0.5
	}
	if rep.Denied {
		if p.utilities == nil {
			p.utilities = map[string]float64{}
		}
		p.utilities[domain] = 0.0
		return 0.0
	}
	u := Utility(rep)
	if p.utilities == nil {
		p.utilities = map[string]float64{}
	}
	p.utilities[domain] = u
	return u
}

// handle segments tool context, stamps provenance, enforces hard denies,
// scores, clusters, selects under budget, and rewrites. It runs in
// PreRequestHook, which fires exactly once per top-level request, so there
// is no per-attempt re-run and no fallback memo is needed. Annotate mode
// records the decision without touching the request; block mode rejects the
// request on a hard deny without touching it either.
func (p *pipeline) handle(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) (*Decision, error) {
	d := &Decision{Mode: string(p.cfg.Mode), Policy: "default"}
	if req == nil || req.ChatRequest == nil {
		return d, nil
	}
	chunks, err := Segment(req)
	if err != nil {
		return nil, err
	}
	if len(chunks) == 0 {
		return d, nil
	}
	now := time.Now()
	query := lastUserText(req)
	for i := range chunks {
		chunks[i] = ExtractProvenance(chunks[i], now)
		chunks[i].FreshnessClass = ClassifyChunk(chunks[i].Text)
		chunks[i].Relevance = Relevance(query, chunks[i].Text)
		chunks[i] = Score(chunks[i], ScoreInput{Now: now, FreshnessClass: chunks[i].FreshnessClass, Utility: func(dom string) float64 { return p.utilityFor(dom) }})
	}
	policy := ResolvePolicy(p.cfg, "", "")
	d.Policy = policy.Name
	dropped := []DropReason{}
	live := make([]Chunk, 0, len(chunks))
	for _, c := range chunks {
		if ok, reason := policy.Admit(c); !ok {
			dropped = append(dropped, DropReason{ID: c.ID, Reason: reason})
		} else {
			live = append(live, c)
		}
	}
	if len(dropped) > 0 && p.cfg.Mode == ModeBlock {
		d.RequestID = uuid.NewString()
		d.ChunksIn = len(chunks)
		d.ChunksKept = len(live)
		for _, c := range live {
			d.Kept = append(d.Kept, c.ID)
		}
		d.Dropped = dropped
		d.TokensIn = sumTokens(chunks)
		d.TokensOut = sumTokens(live)
		d.TokenMethod = NewTokenCounter().Method()
		if verr := d.Validate(); verr != nil {
			return nil, verr
		}
		stashPending(ctx, *d, req)
		return d, fmt.Errorf("context-curator: request blocked: %s", dropped[0].Reason)
	}
	// Stale refusal runs after the block gate so block mode still fires only
	// on hard denies, and before clustering so a superseded chunk never
	// becomes a cluster representative.
	live, superseded := Supersede(live, now)
	dropped = append(dropped, superseded...)
	sets := clusterSets(live, p.cfg.Independence.NearDuplicateThreshold)
	reps := make([]Chunk, 0, len(sets))
	for _, members := range sets {
		best := members[0]
		for _, i := range members[1:] {
			if betterRepresentative(live[i], live[best]) {
				best = i
			}
		}
		for _, i := range members {
			if i != best {
				dropped = append(dropped, DropReason{ID: live[i].ID, Reason: duplicateOfPrefix + live[best].ID})
			}
		}
		rep := live[best]
		rep.ClusterID = rep.ID
		rep.ClusterSize = len(members)
		reps = append(reps, rep)
	}
	kept, over := Select(reps, p.cfg.Budget.MaxContextTokens, p.cfg.Independence.MinSources, lambdaMMR)
	dropped = append(dropped, over...)
	if p.cfg.Mode == ModeRewrite {
		if err := Rewrite(req, kept); err != nil {
			return nil, err
		}
	}
	d.RequestID = uuid.NewString()
	d.ChunksIn = len(chunks)
	d.ChunksKept = len(kept)
	for _, c := range kept {
		d.Kept = append(d.Kept, c.ID)
	}
	d.Dropped = dropped
	d.TokensIn = sumTokens(chunks)
	d.TokensOut = sumTokens(kept)
	d.TokenMethod = NewTokenCounter().Method()
	if verr := d.Validate(); verr != nil {
		return nil, verr
	}
	stashPending(ctx, *d, req)
	return d, nil
}

// lastUserText returns the most recent user message: the query the relevance
// weight scores chunks against.
func lastUserText(req *schemas.BifrostRequest) string {
	if req == nil || req.ChatRequest == nil {
		return ""
	}
	for i := len(req.ChatRequest.Input) - 1; i >= 0; i-- {
		if req.ChatRequest.Input[i].Role == schemas.ChatMessageRoleUser {
			return messageText(req.ChatRequest.Input[i])
		}
	}
	return ""
}

func sumTokens(chunks []Chunk) int {
	total := 0
	for _, c := range chunks {
		total += c.Tokens
	}
	return total
}
