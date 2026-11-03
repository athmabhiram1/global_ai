package main

import "time"

// AuthorityTier ranks a chunk's source. Decided by provenance + policy lists.
type AuthorityTier string

const (
	AuthorityPrimary    AuthorityTier = "primary"
	AuthorityReputable  AuthorityTier = "reputable"
	AuthorityAggregator AuthorityTier = "aggregator"
	AuthorityUnknown    AuthorityTier = "unknown"
	AuthorityDenied     AuthorityTier = "denied"
)

// ProvenanceConfidence records whether a chunk carries its own source URL.
type ProvenanceConfidence string

const (
	ProvenanceKnown    ProvenanceConfidence = "known"
	ProvenanceInferred ProvenanceConfidence = "inferred"
)

// Chunk is one admissible unit of tool context. Field reference:
// docs/ARCHITECTURE.md §6, plus Role (which message the text came from).
type Chunk struct {
	ID             string               `json:"id"`
	ToolCallID     string               `json:"tool_call_id"`
	Role           string               `json:"role"`
	SourceURLs     []string             `json:"source_urls"`
	Domain         string               `json:"domain"`
	FetchedAt      time.Time            `json:"fetched_at"`
	ContentHash    string               `json:"content_hash"`
	Tokens         int                  `json:"tokens"`
	Text           string               `json:"text"`
	Authority      AuthorityTier        `json:"authority"`
	FreshnessClass string               `json:"freshness_class"`
	ClusterID      string               `json:"cluster_id"`
	ClusterSize    int                  `json:"cluster_size"`
	Relevance      float64              `json:"relevance"`
	Freshness      float64              `json:"freshness"`
	Independence   float64              `json:"independence"`
	Utility        float64              `json:"utility"`
	Score          float64              `json:"score"`
	Provenance     ProvenanceConfidence `json:"provenance"`
	Refreshed      bool                 `json:"refreshed"`
	RefreshFailed  bool                 `json:"refresh_failed"`
}
