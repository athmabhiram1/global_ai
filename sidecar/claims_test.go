// FROZEN — Wave 2 Task 2.7 sidecar claims tests. Do not edit without a plan amendment.
package main

import (
	"context"
	"strings"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

type fakeRetriever struct {
	calls   int
	results []retriever.Result
	err     error
}

func (f *fakeRetriever) Name() string { return "fake" }

func (f *fakeRetriever) Search(_ context.Context, _ retriever.Query) ([]retriever.Result, error) {
	f.calls++
	return f.results, f.err
}

func (f *fakeRetriever) Extract(_ context.Context, _ []string, _ string) ([]retriever.Result, error) {
	return nil, nil
}

type stubLLM struct {
	calls int
	out   []string
	err   error
}

func (s *stubLLM) ExtractClaims(_ context.Context, _ string) ([]string, error) {
	s.calls++
	return s.out, s.err
}

func TestClaimFreshnessUsesEvidence(t *testing.T) {
	fake := &fakeRetriever{results: []retriever.Result{
		{URL: "https://example.com/price", Content: "the cat sits on the mat"},
	}}
	got, err := ScoreClaims(context.Background(), []string{"the cat sits"}, fake)
	if err != nil {
		t.Fatalf("ScoreClaims: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("ScoreClaims returned %d claims, want 1", len(got))
	}
	if got[0].Source != "https://example.com/price" {
		t.Fatalf("Source = %q, want top-hit URL", got[0].Source)
	}
	if len(got[0].Evidence) == 0 {
		t.Fatal("Evidence is empty, want top-hit content")
	}
	if got[0].Freshness <= 0 || got[0].Freshness > 1 {
		t.Fatalf("Freshness = %v, want in (0,1]", got[0].Freshness)
	}
}

func TestScoreClaimsNoHitsYieldsZeroFreshness(t *testing.T) {
	fake := &fakeRetriever{results: nil}
	got, err := ScoreClaims(context.Background(), []string{"the cat sits"}, fake)
	if err != nil {
		t.Fatalf("ScoreClaims: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("ScoreClaims returned %d claims, want 1", len(got))
	}
	if got[0].Freshness != 0 {
		t.Fatalf("Freshness = %v, want 0 with no hits", got[0].Freshness)
	}
	if len(got[0].Evidence) != 0 {
		t.Fatalf("Evidence = %v, want empty with no hits", got[0].Evidence)
	}
}

func TestExtractClaimsEmptyTextSkipsLLM(t *testing.T) {
	stub := &stubLLM{out: []string{"a"}}
	got, err := ExtractClaims(context.Background(), "  ", stub)
	if err != nil {
		t.Fatalf("ExtractClaims: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("ExtractClaims empty text = %v, want empty", got)
	}
	if stub.calls != 0 {
		t.Fatalf("LLM calls = %d, want 0 for empty text", stub.calls)
	}
}

func TestScoreClaimsCachedPerClaim(t *testing.T) {
	fake := &fakeRetriever{results: []retriever.Result{
		{URL: "https://example.com/a", Content: "the cat sits on the mat"},
	}}
	s := NewServer(nil, "", "")
	ctx := context.Background()
	first, err := s.scoreClaimsCached(ctx, []string{"the cat sits"}, fake)
	if err != nil {
		t.Fatalf("first scoreClaimsCached: %v", err)
	}
	second, err := s.scoreClaimsCached(ctx, []string{"the cat sits"}, fake)
	if err != nil {
		t.Fatalf("second scoreClaimsCached: %v", err)
	}
	if fake.calls != 1 {
		t.Fatalf("retriever Search calls = %d, want 1 (second call cached)", fake.calls)
	}
	if len(first) != 1 || len(second) != 1 || first[0].Freshness != second[0].Freshness {
		t.Fatalf("cached mismatch: %+v vs %+v", first, second)
	}
	if !strings.Contains(first[0].Source, "example.com") {
		t.Fatalf("Source = %q, want evidence URL", first[0].Source)
	}
}
