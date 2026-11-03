package main

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

// duplicateOfPrefix marks a drop that collapses into a kept chunk:
// "duplicate_of:<id>" with a non-empty target.
const duplicateOfPrefix = "duplicate_of:"

// DropReason records why one chunk did not survive admission.
type DropReason struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

// Decision is the admission record for one request. Field reference:
// docs/ARCHITECTURE.md §6.
type Decision struct {
	RequestID     string       `json:"request_id"`
	Policy        string       `json:"policy"`
	Mode          Mode         `json:"mode"`
	ChunksIn      int          `json:"chunks_in"`
	ChunksKept    int          `json:"chunks_kept"`
	Kept          []string     `json:"kept"`
	Dropped       []DropReason `json:"dropped"`
	TokensIn      int          `json:"tokens_in"`
	TokensOut     int          `json:"tokens_out"`
	TokenMethod   string       `json:"token_method"`
	TavilyCredits int          `json:"tavily_credits"`
	Transport     string       `json:"transport"`
	DurationMs    int64        `json:"duration_ms"`
}

// validReason reports whether r is a member of the closed reason list.
func validReason(r string) bool {
	switch r {
	case ReasonStale, ReasonAuthorityDenied, ReasonLowRelevance,
		ReasonOverBudget, ReasonPolicyMinSources, ReasonRefreshFailed,
		ReasonProvenanceUnknown:
		return true
	}
	return strings.HasPrefix(r, duplicateOfPrefix) &&
		len(strings.TrimPrefix(r, duplicateOfPrefix)) > 0
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
