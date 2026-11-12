package main

import (
	"context"
	"strings"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/model"
)

// Task 3: Autopsy accepts only retained chunks and enriches the result.
func TestAutopsyRetainedRejectsDropped(t *testing.T) {
	s := openAutopsyTestServer(t, keptDecision(), `{"messages":[]}`)
	s.Replayer = &countingReplayer{with: "answer a. second.", without: "answer b. second."}
	_, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "c2"})
	if err == nil {
		t.Fatal("Autopsy dropped chunk: expected error, got nil")
	}
	if !strings.Contains(err.Error(), "not retained") {
		t.Fatalf("Autopsy dropped chunk error = %q, want it to contain %q", err.Error(), "not retained")
	}
}

func enrichedDecision() model.Decision {
	return model.Decision{
		RequestID:  "req-1",
		ChunksIn:   2,
		ChunksKept: 1,
		Kept:       []string{"c1"},
		Dropped:    []model.DropReason{{ID: "c2", Reason: "stale"}},
		Chunks: []model.ChunkRecord{
			{ID: "c1", Domain: "example.com", Verdict: "keep", Tokens: 42},
			{ID: "c2", Domain: "stale.example", Verdict: "drop", Reason: "stale", Tokens: 7},
		},
	}
}

func TestAutopsyRetainedEnrichesResult(t *testing.T) {
	s := openAutopsyTestServer(t, enrichedDecision(), `{"messages":[]}`)
	s.Replayer = &countingReplayer{with: "The cat sits. It is sunny.", without: "The dog runs. It is sunny."}
	res, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "c1"})
	if err != nil {
		t.Fatalf("Autopsy: %v", err)
	}
	if len(res.WithSentences) != 2 || res.WithSentences[0] != "The cat sits" {
		t.Fatalf("with_sentences = %q, want [The cat sits, It is sunny]", res.WithSentences)
	}
	if len(res.WithoutSentences) != 2 || res.WithoutSentences[0] != "The dog runs" {
		t.Fatalf("without_sentences = %q, want [The dog runs, It is sunny]", res.WithoutSentences)
	}
	if len(res.ChangedIndices) != 1 || res.ChangedIndices[0] != 0 {
		t.Fatalf("changed_indices = %v, want [0]", res.ChangedIndices)
	}
	if !strings.Contains(res.Attribution, "example.com") {
		t.Fatalf("attribution = %q, want it to name the chunk domain", res.Attribution)
	}
	if res.ChunkDomain != "example.com" {
		t.Fatalf("chunk_domain = %q, want %q", res.ChunkDomain, "example.com")
	}
	if res.ChunkTokens != 42 {
		t.Fatalf("chunk_tokens = %d, want 42", res.ChunkTokens)
	}
	if res.Influence < 0 || res.Influence > 1 {
		t.Fatalf("influence = %v, want in [0,1]", res.Influence)
	}
}

// Cached rows written before enrichment existed carry no sentence fields.
// Serving them must backfill from the stored answers, never replay and
// never serve null arrays.
func TestAutopsyCachedBackfillsEnrichment(t *testing.T) {
	s := openAutopsyTestServer(t, enrichedDecision(), `{"messages":[]}`)
	legacy := `{"influence":0.5,"diff":{"changed":["The cat sits -> The dog runs"],"added":[],"removed":[],"total":2},"with":"The cat sits. It is sunny.","without":"The dog runs. It is sunny.","cached":false}`
	if err := s.Store.SetAutopsy(context.Background(), "req-1", "c1", legacy); err != nil {
		t.Fatalf("seed legacy cache: %v", err)
	}
	fake := &countingReplayer{with: "UNUSED", without: "UNUSED"}
	s.Replayer = fake
	res, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "c1"})
	if err != nil {
		t.Fatalf("Autopsy cached: %v", err)
	}
	if !res.Cached {
		t.Fatal("Autopsy cached: Cached = false, want true")
	}
	if fake.calls != 0 {
		t.Fatalf("replayer calls = %d, want 0 (cache hit must not replay)", fake.calls)
	}
	if len(res.WithSentences) != 2 || res.WithSentences[0] != "The cat sits" {
		t.Fatalf("with_sentences = %q, want backfilled [The cat sits, It is sunny]", res.WithSentences)
	}
	if len(res.WithoutSentences) != 2 || res.WithoutSentences[0] != "The dog runs" {
		t.Fatalf("without_sentences = %q, want backfilled [The dog runs, It is sunny]", res.WithoutSentences)
	}
	if len(res.ChangedIndices) != 1 || res.ChangedIndices[0] != 0 {
		t.Fatalf("changed_indices = %v, want backfilled [0]", res.ChangedIndices)
	}
	if !strings.Contains(res.Attribution, "example.com") {
		t.Fatalf("attribution = %q, want backfilled domain", res.Attribution)
	}
}
