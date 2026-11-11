// Package model holds the admission record types shared by the plugin, the
// SQLite store, and the sidecar. A Go plugin cannot import its host's
// package main, so anything crossing that boundary lives here; package main
// re-exports the names it has always used.
package model

import (
	"fmt"
	"strings"
)

// Drop reason codes from docs/ARCHITECTURE.md §6. The fixed list is closed:
// anything else fails Decision.Validate.
const (
	ReasonStale             = "stale"
	ReasonAuthorityDenied   = "authority_denied"
	ReasonLowRelevance      = "low_relevance"
	ReasonOverBudget        = "over_budget"
	ReasonPolicyMinSources  = "policy_min_sources"
	ReasonRefreshFailed     = "refresh_failed"
	ReasonProvenanceUnknown = "provenance_unknown"
)

// DuplicateOfPrefix marks a drop that collapses into a kept chunk:
// "duplicate_of:<id>" with a non-empty target.
const DuplicateOfPrefix = "duplicate_of:"

// DropReason records why one chunk did not survive admission.
type DropReason struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

// Decision is the admission record for one request. Field reference:
// docs/ARCHITECTURE.md §6.
//
// Chunks is additive: one per-record summary of every input chunk, built by
// the pipeline after selection. Old rows persisted without it still load
// (nil slice) and validate unchanged.
type Decision struct {
	RequestID     string        `json:"request_id"`
	Policy        string        `json:"policy"`
	Mode          string        `json:"mode"`
	ChunksIn      int           `json:"chunks_in"`
	ChunksKept    int           `json:"chunks_kept"`
	Kept          []string      `json:"kept"`
	Dropped       []DropReason  `json:"dropped"`
	TokensIn      int           `json:"tokens_in"`
	TokensOut     int           `json:"tokens_out"`
	TokenMethod   string        `json:"token_method"`
	Chunks        []ChunkRecord `json:"chunks,omitempty"`
	TavilyCredits int           `json:"tavily_credits"`
	Transport     string        `json:"transport"`
	DurationMs    int64         `json:"duration_ms"`
}

// ChunkRecord is the per-chunk summary the UI drawer renders: kept chunks
// carry their final scores and cluster fields, dropped chunks carry the drop
// reason and their last computed scores.
type ChunkRecord struct {
	ID             string   `json:"id"`
	Domain         string   `json:"domain"`
	Verdict        string   `json:"verdict"` // keep | drop
	Reason         string   `json:"reason,omitempty"`
	Authority      string   `json:"authority"`
	FreshnessClass string   `json:"freshness_class"`
	AgeHours       float64  `json:"age_hours"`
	Tokens         int      `json:"tokens"`
	ClusterID      string   `json:"cluster_id,omitempty"`
	ClusterSize    int      `json:"cluster_size,omitempty"`
	Provenance     string   `json:"provenance"`
	Refreshed      bool     `json:"refreshed"`
	RefreshFailed  bool     `json:"refresh_failed"`
	SourceURLs     []string `json:"source_urls,omitempty"`
	Relevance      float64  `json:"relevance"`
	Freshness      float64  `json:"freshness"`
	Independence   float64  `json:"independence"`
	Utility        float64  `json:"utility"`
	Score          float64  `json:"score"`
}

// validReason reports whether r is a member of the closed reason list.
func validReason(r string) bool {
	switch r {
	case ReasonStale, ReasonAuthorityDenied, ReasonLowRelevance,
		ReasonOverBudget, ReasonPolicyMinSources, ReasonRefreshFailed,
		ReasonProvenanceUnknown:
		return true
	}
	return strings.HasPrefix(r, DuplicateOfPrefix) &&
		len(strings.TrimPrefix(r, DuplicateOfPrefix)) > 0
}

// Validate enforces the accountability invariant: every input chunk is either
// kept or dropped with a reason, never both, never neither.
func (d Decision) Validate() error {
	if d.ChunksIn < 0 {
		return fmt.Errorf("context-curator: chunks_in must be >= 0")
	}
	if d.ChunksKept < 0 || d.ChunksKept > d.ChunksIn {
		return fmt.Errorf("context-curator: chunks_kept %d out of range for %d in",
			d.ChunksKept, d.ChunksIn)
	}
	if len(d.Dropped) != d.ChunksIn-d.ChunksKept {
		return fmt.Errorf("context-curator: %d dropped does not reconcile %d in - %d kept",
			len(d.Dropped), d.ChunksIn, d.ChunksKept)
	}
	kept := make(map[string]bool, len(d.Kept))
	for _, id := range d.Kept {
		kept[id] = true
	}
	seen := make(map[string]bool, len(d.Dropped))
	for _, drop := range d.Dropped {
		if drop.ID == "" {
			return fmt.Errorf("context-curator: dropped chunk needs an id")
		}
		if !validReason(drop.Reason) {
			return fmt.Errorf("context-curator: unknown drop reason %q for %q", drop.Reason, drop.ID)
		}
		if kept[drop.ID] {
			return fmt.Errorf("context-curator: chunk %q is both kept and dropped", drop.ID)
		}
		if seen[drop.ID] {
			return fmt.Errorf("context-curator: chunk %q dropped twice", drop.ID)
		}
		seen[drop.ID] = true
	}
	return nil
}
