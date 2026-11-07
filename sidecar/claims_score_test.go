package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// New coverage, not frozen: claims scoring endpoint serves per-claim
// freshness without an LLM (sentence-split claims + Tavily evidence).
// RED first: route does not exist yet.

type stubClaimRetriever struct{}

func (stubClaimRetriever) Name() string { return "stub" }

func (stubClaimRetriever) Search(_ context.Context, q retriever.Query) ([]retriever.Result, error) {
	return []retriever.Result{{URL: "https://example.com/evidence", Content: q.Text}}, nil
}

func (stubClaimRetriever) Extract(_ context.Context, urls []string, q string) ([]retriever.Result, error) {
	return []retriever.Result{{URL: urls[0], Content: q}}, nil
}

func TestClaimsScoreEndpointServesFreshness(t *testing.T) {
	s := NewServer(nil, "", "")
	s.Retriever = stubClaimRetriever{}
	body := `{"text":"Pro is $49 per seat. Refunds take 30 days."}`
	req := httptest.NewRequest(http.MethodPost, "/api/context-curator/claims/score", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST claims/score status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var got []Claim
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode claims: %v (body %s)", err, rec.Body.String())
	}
	if len(got) != 2 {
		t.Fatalf("claims = %d, want 2 (body %s)", len(got), rec.Body.String())
	}
	if got[0].Freshness <= 0 || got[0].Freshness > 1 {
		t.Fatalf("claim freshness %f out of (0,1]", got[0].Freshness)
	}
}
