// FROZEN — DO NOT EDIT. Task 1.9 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// fakeSource implements retriever.Retriever in-process: no network, full
// control over hits, failures, and call counts.
type fakeSource struct {
	results      []retriever.Result
	err          error
	searchCalls  int
	extractCalls int
}

func (f *fakeSource) Name() string { return "fake" }
func (f *fakeSource) Search(_ context.Context, _ retriever.Query) ([]retriever.Result, error) {
	f.searchCalls++
	return f.results, f.err
}
func (f *fakeSource) Extract(_ context.Context, _ []string, _ string) ([]retriever.Result, error) {
	f.extractCalls++
	if f.err != nil {
		return nil, f.err
	}
	return f.results, nil
}

func staleChunk(id string, age time.Duration, urls []string) Chunk {
	return Chunk{
		ID: id, Text: "old text " + id, SourceURLs: urls,
		Provenance: ProvenanceKnown, FreshnessClass: "price",
		FetchedAt: time.Now().Add(-age),
	}
}

func refreshingSource() *fakeSource {
	return &fakeSource{results: []retriever.Result{{URL: "https://x", Content: "search snippet", RawContent: "new text"}}}
}

func TestRefreshOnlyStale(t *testing.T) {
	now := time.Now()
	chunks := []Chunk{
		{ID: "c1", Text: "fresh", FetchedAt: now, FreshnessClass: "price"},
		{ID: "c2", Text: "old", FetchedAt: now.Add(-72 * time.Hour), FreshnessClass: "price", SourceURLs: []string{"https://x"}},
	}
	got, dropped := Refresh(context.Background(), chunks, testPolicy(), refreshingSource(), NewCreditBudget(2))
	if len(dropped) != 0 {
		t.Fatalf("dropped = %v, want none", dropped)
	}
	if got[0].Refreshed {
		t.Fatal("fresh chunk refreshed")
	}
	if !got[1].Refreshed || got[1].Text != "new text" {
		t.Fatalf("stale chunk = %+v, want refreshed with new text", got[1])
	}
	if !got[1].FetchedAt.After(now.Add(-time.Minute)) {
		t.Fatal("refreshed chunk FetchedAt not updated")
	}
}

func TestBudgetEnforced(t *testing.T) {
	chunks := []Chunk{
		staleChunk("c1", 72*time.Hour, []string{"https://a"}),
		staleChunk("c2", 72*time.Hour, []string{"https://b"}),
		staleChunk("c3", 72*time.Hour, []string{"https://c"}),
		staleChunk("c4", 72*time.Hour, []string{"https://d"}),
		staleChunk("c5", 72*time.Hour, []string{"https://e"}),
	}
	r := refreshingSource()
	b := NewCreditBudget(1)
	_, _ = Refresh(context.Background(), chunks, testPolicy(), r, b)
	if b.Spent() > 1 {
		t.Fatalf("spent = %d, want <= 1", b.Spent())
	}
	if r.searchCalls > 1 {
		t.Fatalf("search calls = %d, want <= 1 (stop at budget)", r.searchCalls)
	}
}

func TestFailureDegradesNotDrops(t *testing.T) {
	got, dropped := Refresh(context.Background(),
		[]Chunk{staleChunk("c1", 72*time.Hour, []string{"https://x"})},
		testPolicy(), &fakeSource{err: errors.New("down")}, NewCreditBudget(2))
	if len(got) != 1 || !got[0].RefreshFailed || len(dropped) != 0 {
		t.Fatalf("got=%+v dropped=%v, want kept with RefreshFailed, no drops", got, dropped)
	}
}

func TestStaleWithoutURLDropped(t *testing.T) {
	got, dropped := Refresh(context.Background(),
		[]Chunk{staleChunk("c1", 72*time.Hour, nil)},
		testPolicy(), &fakeSource{}, NewCreditBudget(2))
	if len(got) != 0 || len(dropped) != 1 || dropped[0].Reason != ReasonStale {
		t.Fatalf("got=%+v dropped=%+v, want one stale drop", got, dropped)
	}
}

func TestFreshChunkNeverCostsBudget(t *testing.T) {
	now := time.Now()
	r := &fakeSource{}
	b := NewCreditBudget(2)
	_, _ = Refresh(context.Background(),
		[]Chunk{{ID: "c1", Text: "fresh", FetchedAt: now, FreshnessClass: "price"}},
		testPolicy(), r, b)
	if b.Spent() != 0 || r.searchCalls != 0 {
		t.Fatalf("spent=%d calls=%d, want zero for fresh input", b.Spent(), r.searchCalls)
	}
}

func TestBoundaryAgeNotStale(t *testing.T) {
	now := time.Now()
	r := &fakeSource{}
	b := NewCreditBudget(2)
	got, dropped := Refresh(context.Background(),
		[]Chunk{{ID: "c1", Text: "edge", FetchedAt: now.Add(-24 * time.Hour), FreshnessClass: "price", SourceURLs: []string{"https://x"}}},
		testPolicy(), r, b)
	if len(dropped) != 0 || got[0].Refreshed || r.searchCalls != 0 {
		t.Fatal("chunk exactly at max age must not count as stale")
	}
}

func TestBudgetTakeRefund(t *testing.T) {
	b := NewCreditBudget(1)
	if !b.Take(1) || b.Take(1) || b.Spent() != 1 {
		t.Fatal("Take must succeed once, then refuse, spending exactly 1")
	}
}

func testPolicy() Policy { return Policy{Name: "test", Mode: ModeAnnotate} }
