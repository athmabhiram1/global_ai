package main

import (
	"context"
	"strings"
	"testing"
)

// Pure-removal autopsy: ablating the tool sentence deletes it from the echo,
// so Changed is empty but Removed holds the sentence. The result must say so
// and must mark the removed with-side slot for highlighting.
func TestAutopsyPureRemovalAttribution(t *testing.T) {
	s := openAutopsyTestServer(t, keptDecision(), `{"messages":[]}`)
	s.Replayer = &countingReplayer{
		with:    "First sentence. Second sentence. Third sentence.",
		without: "First sentence. Third sentence.",
	}
	res, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "c1"})
	if err != nil {
		t.Fatalf("Autopsy: %v", err)
	}
	if len(res.Diff.Removed) != 1 {
		t.Fatalf("Removed = %v, want 1 entry", res.Diff.Removed)
	}
	if strings.Contains(res.Attribution, "did not change the answer") {
		t.Fatalf("attribution = %q, must not claim no change when a sentence was removed", res.Attribution)
	}
	if !strings.Contains(res.Attribution, "removed") {
		t.Fatalf("attribution = %q, want it to report the removal", res.Attribution)
	}
	if len(res.ChangedIndices) != 1 || res.ChangedIndices[0] != 1 {
		t.Fatalf("changed_indices = %v, want [1] (the removed with-side slot)", res.ChangedIndices)
	}
}

// Substitution behavior is unchanged: paired gaps still land in Changed and
// keep their with-side indices.
func TestAutopsySubstitutionUnchanged(t *testing.T) {
	s := openAutopsyTestServer(t, keptDecision(), `{"messages":[]}`)
	s.Replayer = &countingReplayer{
		with:    "The cat sits. It is sunny.",
		without: "The dog runs. It is sunny.",
	}
	res, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "c1"})
	if err != nil {
		t.Fatalf("Autopsy: %v", err)
	}
	if len(res.Diff.Changed) != 1 {
		t.Fatalf("Changed = %v, want 1 entry", res.Diff.Changed)
	}
	if len(res.ChangedIndices) != 1 || res.ChangedIndices[0] != 0 {
		t.Fatalf("changed_indices = %v, want [0]", res.ChangedIndices)
	}
	if !strings.Contains(res.Attribution, "mattered") {
		t.Fatalf("attribution = %q, want the substitution wording", res.Attribution)
	}
}
