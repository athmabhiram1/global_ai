package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
)

// Autopsy ablation budget: at most 5 ablations per call. This method ablates
// exactly one chunk, so every call costs 1 ablation — the cap is documented
// here and enforced by callers that batch multiple chunks through Autopsy.
const maxAblationsPerCall = 5

// autopsyCacheTTL is how long a stored ablation result is served as cached.
const autopsyCacheTTL = 60 * time.Minute

// Autopsy replays one recorded request with and without a single chunk and
// scores the chunk's causal influence on the answer.
//
// SentenceDiff and Influence live in diff.go (sibling owner): the pair of
// replayed answers is aligned with SentenceDiff and reduced to influence
// with Influence, which returns a value in [0,1].
func (s *Server) Autopsy(ctx context.Context, req AutopsyRequest) (*AutopsyResult, error) {
	if req.RequestID == "" || req.ChunkID == "" {
		return nil, fmt.Errorf("autopsy: request and chunk ids required")
	}
	if s.Store == nil {
		return nil, fmt.Errorf("autopsy: no store")
	}
	decision, rawReq, err := s.Store.GetDecision(ctx, req.RequestID)
	if err != nil {
		return nil, err
	}
	kept := false
	for _, id := range decision.Kept {
		if id == req.ChunkID {
			kept = true
			break
		}
	}
	if !kept {
		// Retained-only: a dropped chunk is absent from the recorded
		// post-rewrite request, so ablating it would remove nothing and
		// score a fake zero. Reject it instead of pretending to ablate.
		return nil, fmt.Errorf("autopsy: chunk %q was not retained in request %q: %w",
			req.ChunkID, req.RequestID, errAutopsyNotFound)
	}
	if cached, createdAt, found, err := s.Store.GetAutopsy(ctx, req.RequestID, req.ChunkID); err != nil {
		return nil, err
	} else if found && time.Since(time.Unix(createdAt, 0)) < autopsyCacheTTL {
		var res AutopsyResult
		if err := json.Unmarshal([]byte(cached), &res); err != nil {
			return nil, fmt.Errorf("autopsy: cached result corrupt: %w", err)
		}
		res.Cached = true
		return &res, nil
	}
	if s.Replayer == nil {
		return nil, fmt.Errorf("autopsy: no replayer")
	}
	with, err := s.Replayer.Replay(ctx, rawReq, "")
	if err != nil {
		return nil, fmt.Errorf("autopsy: replay with chunk: %w", err)
	}
	without, err := s.Replayer.Replay(ctx, rawReq, req.ChunkID)
	if err != nil {
		return nil, fmt.Errorf("autopsy: replay without chunk: %w", err)
	}
	diff := SentenceDiff(with, without)
	withSent, _ := splitDiffSentences(with)
	withoutSent, _ := splitDiffSentences(without)
	if withSent == nil {
		withSent = []string{}
	}
	if withoutSent == nil {
		withoutSent = []string{}
	}
	domain, tokens := ablatedChunk(decision, req.ChunkID)
	display := domain
	if display == "" {
		display = "chunk " + req.ChunkID
	}
	attribution := fmt.Sprintf("%s did not change the answer", display)
	if len(diff.Changed) > 0 {
		attribution = fmt.Sprintf("%s mattered: %d/%d changed", display, len(diff.Changed), diff.Total)
	}
	res := &AutopsyResult{
		Influence:        Influence(diff),
		Diff:             diff,
		With:             with,
		Without:          without,
		WithSentences:    withSent,
		WithoutSentences: withoutSent,
		ChangedIndices:   changedIndices(with, without),
		Attribution:      attribution,
		ChunkDomain:      domain,
		ChunkTokens:      tokens,
	}
	raw, err := json.Marshal(res)
	if err != nil {
		return nil, fmt.Errorf("autopsy: %w", err)
	}
	if err := s.Store.SetAutopsy(ctx, req.RequestID, req.ChunkID, string(raw)); err != nil {
		return nil, err
	}
	return res, nil
}

func (s *Server) handleAutopsy(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	var req AutopsyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeErr(w, http.StatusBadRequest, "invalid autopsy request")
		return
	}
	if req.RequestID == "" || req.ChunkID == "" {
		s.writeErr(w, http.StatusBadRequest, "request_id and chunk_id required")
		return
	}
	res, err := s.Autopsy(r.Context(), req)
	if err != nil {
		if errors.Is(err, errAutopsyNotFound) || isNotFoundErr(err) {
			s.writeErr(w, http.StatusNotFound, err.Error())
			return
		}
		s.writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.writeJSON(w, http.StatusOK, res)
}

var errAutopsyNotFound = errors.New("autopsy: not found")

func isNotFoundErr(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "not among") ||
		strings.Contains(msg, "not retained") ||
		strings.Contains(msg, "no rows") ||
		strings.Contains(msg, "not found") ||
		strings.Contains(msg, "unknown")
}

// ablatedChunk returns the recorded domain and token count for one kept
// chunk. Old rows persist no Chunks JSON, so a missing record degrades to an
// empty domain and zero tokens rather than an error.
func ablatedChunk(d model.Decision, chunkID string) (string, int) {
	for _, c := range d.Chunks {
		if c.ID == chunkID {
			return c.Domain, c.Tokens
		}
	}
	return "", 0
}

// changedIndices marks the with-side sentence slots that pair into a Changed
// entry: it replays the SentenceDiff anchor walk and collects the with-side
// indices of each paired gap. Empty comparisons yield an empty slice, never
// nil, so the JSON stays an array.
func changedIndices(a, b string) []int {
	rawA, normA := splitDiffSentences(a)
	rawB, normB := splitDiffSentences(b)
	anchors := append(lcsAlignPairs(normA, normB), [2]int{len(rawA), len(rawB)})
	out := []int{}
	prevA, prevB := 0, 0
	for _, anchor := range anchors {
		paired := min(len(rawA[prevA:anchor[0]]), len(rawB[prevB:anchor[1]]))
		for k := range paired {
			out = append(out, prevA+k)
		}
		prevA, prevB = anchor[0]+1, anchor[1]+1
	}
	return out
}
