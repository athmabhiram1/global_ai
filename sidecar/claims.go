package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// ClaimLLM extracts atomic claims from retained text. It is fulfilled by the
// model client the sidecar is configured with.
type ClaimLLM interface {
	ExtractClaims(ctx context.Context, text string) ([]string, error)
}

// ExtractClaims pulls atomic claims from text. Empty text short-circuits to
// an empty result without calling the LLM; a nil LLM is an error.
func ExtractClaims(ctx context.Context, text string, llm ClaimLLM) ([]string, error) {
	if strings.TrimSpace(text) == "" {
		return []string{}, nil
	}
	if llm == nil {
		return nil, fmt.Errorf("claims: no LLM configured")
	}
	claims, err := llm.ExtractClaims(ctx, text)
	if err != nil {
		return nil, fmt.Errorf("claims: %w", err)
	}
	if claims == nil {
		return []string{}, nil
	}
	return claims, nil
}

// ScoreClaims attaches freshness evidence to each claim with one Tavily
// search per claim. The top hit supplies Source (URL) and Evidence
// (content); Freshness is 0.01+0.99*wordOverlap(claim, evidence) clamped to
// (0,1]. No hits yields Freshness 0 with empty evidence and no error.
// ScoreClaims is pure — per-claim caching lives in scoreClaimsCached.
func ScoreClaims(ctx context.Context, claims []string, r retriever.Retriever) ([]Claim, error) {
	if len(claims) == 0 {
		return []Claim{}, nil
	}
	out := make([]Claim, 0, len(claims))
	for _, c := range claims {
		results, err := r.Search(ctx, retriever.Query{Text: c})
		if err != nil {
			return nil, fmt.Errorf("claims: search: %w", err)
		}
		if len(results) == 0 {
			out = append(out, Claim{Text: c})
			continue
		}
		top := results[0]
		evidence := top.Content
		if evidence == "" {
			evidence = top.RawContent
		}
		freshness := 0.01 + 0.99*wordOverlap(c, evidence)
		if freshness <= 0 {
			freshness = 0.01
		}
		if freshness > 1 {
			freshness = 1
		}
		claim := Claim{Text: c, Source: top.URL, Freshness: freshness}
		if evidence != "" {
			claim.Evidence = []string{evidence}
		}
		out = append(out, claim)
	}
	return out, nil
}

// wordOverlap is the fraction of claim words that also appear in the
// evidence, case-insensitive. 0 when either side is empty.
func wordOverlap(claim, evidence string) float64 {
	words := strings.Fields(strings.ToLower(claim))
	if len(words) == 0 || strings.TrimSpace(evidence) == "" {
		return 0
	}
	inEvidence := make(map[string]bool, len(words))
	for _, w := range strings.Fields(strings.ToLower(evidence)) {
		inEvidence[w] = true
	}
	hit := 0
	for _, w := range words {
		if inEvidence[w] {
			hit++
		}
	}
	return float64(hit) / float64(len(words))
}

// claimKey identifies one cached claim by the sha256 hex of its text.
func claimKey(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// scoreClaimsCached is the Server wrapper around ScoreClaims: claims already
// scored are served from s.claims (keyed by sha256 hex of the claim text)
// so a repeated claim costs no retriever search.
func (s *Server) scoreClaimsCached(ctx context.Context, claims []string, r retriever.Retriever) ([]Claim, error) {
	if len(claims) == 0 {
		return []Claim{}, nil
	}
	s.mu.Lock()
	if s.claims == nil {
		s.claims = map[string]Claim{}
	}
	cached := make([]Claim, len(claims))
	var missing []string
	var missingIdx []int
	for i, c := range claims {
		if claim, ok := s.claims[claimKey(c)]; ok {
			cached[i] = claim
		} else {
			missing = append(missing, c)
			missingIdx = append(missingIdx, i)
		}
	}
	s.mu.Unlock()
	if len(missing) > 0 {
		scored, err := ScoreClaims(ctx, missing, r)
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		for i, claim := range scored {
			s.claims[claimKey(missing[i])] = claim
			cached[missingIdx[i]] = claim
		}
		s.mu.Unlock()
	}
	return cached, nil
}

func (s *Server) handleClaim(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		s.writeErr(w, http.StatusBadRequest, "claim hash required")
		return
	}
	s.mu.Lock()
	claim, ok := s.claims[hash]
	s.mu.Unlock()
	if !ok {
		s.writeErr(w, http.StatusNotFound, "claim not found")
		return
	}
	s.writeJSON(w, http.StatusOK, claim)
}
