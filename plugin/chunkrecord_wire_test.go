package main

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
	"github.com/athmabhiram/context-curator/plugin/store"
)

func wireChunk(id, domain, url string) Chunk {
	return Chunk{
		ID:             id,
		Domain:         domain,
		SourceURLs:     []string{url},
		Tokens:         10,
		Text:           "wire " + id,
		Authority:      AuthorityReputable,
		FreshnessClass: "static",
		ClusterID:      id,
		ClusterSize:    1,
		Relevance:      0.5,
		Freshness:      0.9,
		Independence:   1.0,
		Utility:        0.5,
		Score:          0.7,
		Provenance:     ProvenanceKnown,
		FetchedAt:      time.Now().Add(-2 * time.Hour),
	}
}

func TestBuildChunkRecordsKeepsScores(t *testing.T) {
	now := time.Now()
	kept := wireChunk("c0", "a.example.com", "https://a.example.com/x")
	dropped := wireChunk("c1", "b.example.com", "https://b.example.com/y")
	dropped.Refreshed = true
	all := []Chunk{kept, dropped}
	drops := []DropReason{{ID: "c1", Reason: ReasonOverBudget}}
	recs := buildChunkRecords(all, []string{"c0"}, drops, now)
	if len(recs) != 2 {
		t.Fatalf("buildChunkRecords = %d records, want 2", len(recs))
	}
	byID := map[string]model.ChunkRecord{}
	for _, r := range recs {
		byID[r.ID] = r
	}
	k := byID["c0"]
	if k.Verdict != "keep" {
		t.Fatalf("kept verdict = %q, want keep", k.Verdict)
	}
	if k.Reason != "" {
		t.Fatalf("kept reason = %q, want empty", k.Reason)
	}
	if k.Domain != kept.Domain || k.Authority != string(kept.Authority) ||
		k.FreshnessClass != kept.FreshnessClass || k.Tokens != kept.Tokens ||
		k.ClusterID != kept.ClusterID || k.ClusterSize != kept.ClusterSize ||
		k.Provenance != string(kept.Provenance) || k.Refreshed != kept.Refreshed ||
		k.RefreshFailed != kept.RefreshFailed {
		t.Fatalf("kept record lost fields: %+v", k)
	}
	if k.Score != kept.Score || k.Relevance != kept.Relevance ||
		k.Freshness != kept.Freshness || k.Independence != kept.Independence ||
		k.Utility != kept.Utility {
		t.Fatalf("kept record lost scores: %+v", k)
	}
	if want := now.Sub(kept.FetchedAt).Hours(); k.AgeHours < want-0.01 || k.AgeHours > want+0.01 {
		t.Fatalf("kept age_hours = %v, want ~%v", k.AgeHours, want)
	}
	if len(k.SourceURLs) != 1 || k.SourceURLs[0] != "https://a.example.com/x" {
		t.Fatalf("kept source_urls = %v", k.SourceURLs)
	}
	dr := byID["c1"]
	if dr.Verdict != "drop" || dr.Reason != ReasonOverBudget {
		t.Fatalf("dropped record = %+v, want verdict drop reason %q", dr, ReasonOverBudget)
	}
	if dr.Score != dropped.Score || dr.Domain != dropped.Domain {
		t.Fatalf("dropped record lost scores/domain: %+v", dr)
	}
}

func TestDeniedReputationDrops(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.SetReputation(ctx, model.Reputation{
		Domain: "evil.example.com", Alpha: 1, Beta: 1,
		LastSeen: time.Now(), Denied: true,
	}); err != nil {
		t.Fatal(err)
	}
	p := &pipeline{cfg: DefaultConfig(), store: s}
	policy := ResolvePolicy(p.cfg, "", "")
	bad := wireChunk("c0", "evil.example.com", "https://evil.example.com/x")
	if ok, reason := p.admit(bad, policy); ok || reason != ReasonAuthorityDenied {
		t.Fatalf("admit(denied, known) = (%v, %q), want (false, %q)", ok, reason, ReasonAuthorityDenied)
	}
	inferred := bad
	inferred.Provenance = ProvenanceInferred
	if ok, _ := p.admit(inferred, policy); !ok {
		t.Fatal("admit(denied, inferred) must pass: inferred provenance is never hard-dropped")
	}
	good := wireChunk("c1", "a.example.com", "https://a.example.com/x")
	if ok, _ := p.admit(good, policy); !ok {
		t.Fatal("admit(clean domain) must pass")
	}
}

func TestEffectiveModePrefersStored(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	cfg := DefaultConfig()
	cfg.Mode = ModeAnnotate
	p := &pipeline{cfg: cfg, store: s}
	if got := p.effectiveMode(); got != string(ModeAnnotate) {
		t.Fatalf("effectiveMode without stored = %q, want annotate", got)
	}
	if err := s.SetSetting(context.Background(), "mode", "block"); err != nil {
		t.Fatal(err)
	}
	if got := p.effectiveMode(); got != string(ModeBlock) {
		t.Fatalf("effectiveMode with stored = %q, want block", got)
	}
}

func TestDecisionChunksAdditiveJSON(t *testing.T) {
	raw := `{"request_id":"r1","policy":"default","mode":"annotate","chunks_in":1,"chunks_kept":1,"kept":["c0"],"dropped":[]}`
	var d model.Decision
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		t.Fatal(err)
	}
	if d.Chunks != nil {
		t.Fatalf("legacy decision without chunks loaded Chunks = %+v, want nil", d.Chunks)
	}
	if err := d.Validate(); err != nil {
		t.Fatalf("legacy decision must still validate: %v", err)
	}
}
