package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
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
		for _, drop := range decision.Dropped {
			if drop.ID == req.ChunkID {
				kept = true
				break
			}
		}
	}
	if !kept {
		return nil, fmt.Errorf("autopsy: chunk %q is not among request %q kept and dropped ids", req.ChunkID, req.RequestID)
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
	res := &AutopsyResult{
		Influence: Influence(diff),
		Diff:      diff,
		With:      with,
		Without:   without,
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
		strings.Contains(msg, "no rows") ||
		strings.Contains(msg, "not found") ||
		strings.Contains(msg, "unknown")
}
