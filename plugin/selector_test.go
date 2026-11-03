// FROZEN — DO NOT EDIT. Task 1.6 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"testing"
	"time"
)

func fixtureChunks(n, tokens int) []Chunk {
	now := time.Now()
	texts := []string{
		"The price is 49 dollars per seat per month, billed annually",
		"Refunds are available within 30 days of purchase",
		"Version 3.2 requires Go 1.24 or later to build",
		"The law changed in 2024 for data retention periods",
		"Static assets are served from the global CDN edge",
		"Support responds within one business day on paid plans",
		"The API rate limit is 100 requests per minute",
		"SSO is available on enterprise workspaces only",
		"Backups run nightly and retain for seven days",
		"Uptime SLA is 99.9 percent monthly availability",
	}
	chunks := make([]Chunk, 0, n)
	for i := 0; i < n; i++ {
		chunks = append(chunks, Chunk{
			ID:          "f" + string(rune('0'+i)),
			Text:        texts[i%len(texts)],
			Tokens:      tokens,
			Score:       1.0 - float64(i)*0.01,
			ContentHash: "hash-" + string(rune('a'+i)),
			FetchedAt:   now,
		})
	}
	return chunks
}

func totalTokens(chunks []Chunk) int {
	total := 0
	for _, c := range chunks {
		total += c.Tokens
	}
	return total
}

func distinctClusters(chunks []Chunk) int {
	seen := map[string]bool{}
	for _, c := range chunks {
		seen[c.ClusterID] = true
	}
	return len(seen)
}

func TestJaccardIdenticalIsOne(t *testing.T) {
	if got := Jaccard("the price is 49 dollars", "the price is 49 dollars"); got != 1.0 {
		t.Fatalf("jaccard = %f, want 1", got)
	}
}

func TestJaccardDisjointIsZero(t *testing.T) {
	if got := Jaccard("alpha beta gamma delta", "one two three four five six"); got != 0.0 {
		t.Fatalf("jaccard = %f, want 0", got)
	}
}

func TestClusterCollapses(t *testing.T) {
	got := Cluster([]Chunk{
		{ID: "c1", Text: "The price is 49 dollars per seat per month"},
		{ID: "c2", Text: "The price is 49 dollars per seat each month"},
		{ID: "c3", Text: "Refunds within 30 days"},
	}, 0.8)
	if len(got) != 2 {
		t.Fatalf("clusters = %d, want 2", len(got))
	}
	if got[0].ClusterSize != 2 {
		t.Fatalf("first cluster size = %d, want 2", got[0].ClusterSize)
	}
	if got[0].ID != "c1" {
		t.Fatalf("representative = %q, want c1 (first-seen wins ties)", got[0].ID)
	}
	if got[1].ClusterSize != 1 {
		t.Fatalf("second cluster size = %d, want 1", got[1].ClusterSize)
	}
}

func TestClusterEmpty(t *testing.T) {
	if got := Cluster(nil, 0.8); len(got) != 0 {
		t.Fatalf("clusters = %d, want 0", len(got))
	}
}

func TestClusterRepresentativePrefersAuthority(t *testing.T) {
	got := Cluster([]Chunk{
		{ID: "c1", Text: "The price is 49 dollars per seat per month", Authority: AuthorityUnknown},
		{ID: "c2", Text: "The price is 49 dollars per seat each month", Authority: AuthorityPrimary},
	}, 0.5)
	if len(got) != 1 || got[0].ID != "c2" {
		t.Fatalf("representative = %+v, want c2 (higher authority)", got)
	}
	if got[0].ClusterSize != 2 {
		t.Fatalf("cluster size = %d, want 2", got[0].ClusterSize)
	}
}

func TestSelectRespectsBudget(t *testing.T) {
	kept, dropped := Select(fixtureChunks(10, 500), 1600, 1, 0.7)
	if totalTokens(kept) > 1600 {
		t.Fatalf("kept tokens = %d, over budget 1600", totalTokens(kept))
	}
	if len(dropped) != 10-len(kept) {
		t.Fatal("every unkept chunk needs a drop reason")
	}
	for _, d := range dropped {
		if d.Reason != ReasonOverBudget {
			t.Fatalf("drop %q reason = %q, want over_budget", d.ID, d.Reason)
		}
	}
}

func TestSelectEmpty(t *testing.T) {
	k, d := Select(nil, 100, 1, 0.7)
	if len(k) != 0 || len(d) != 0 {
		t.Fatal("expected empty select")
	}
}

func TestSelectHonorsMinSources(t *testing.T) {
	now := time.Now()
	chunks := []Chunk{
		{ID: "a1", Text: "alpha first cluster text here", Tokens: 500, Score: 0.9, ClusterID: "A", ContentHash: "h1", FetchedAt: now},
		{ID: "b1", Text: "beta second cluster text here", Tokens: 500, Score: 0.1, ContentHash: "h2", FetchedAt: now},
		{ID: "c1", Text: "gamma third cluster text here", Tokens: 500, Score: 0.1, ContentHash: "h3", FetchedAt: now},
	}
	kept, _ := Select(chunks, 400, 2, 0.7)
	if distinctClusters(kept) < 2 {
		t.Fatalf("kept clusters = %d, want >= 2", distinctClusters(kept))
	}
}

func TestSelectSingleChunkFits(t *testing.T) {
	kept, dropped := Select(fixtureChunks(1, 100), 4000, 1, 0.7)
	if len(kept) != 1 || len(dropped) != 0 {
		t.Fatalf("kept=%d dropped=%d, want 1/0", len(kept), len(dropped))
	}
}

func TestSelectDeterministic(t *testing.T) {
	first, _ := Select(fixtureChunks(10, 500), 1600, 1, 0.7)
	second, _ := Select(fixtureChunks(10, 500), 1600, 1, 0.7)
	if len(first) != len(second) {
		t.Fatal("non-deterministic selection")
	}
	for i := range first {
		if first[i].ID != second[i].ID {
			t.Fatal("non-deterministic selection order")
		}
	}
}
