package main

import (
	"math"
	"strings"
	"time"
)

// Score weights from docs/ARCHITECTURE.md §7.
const (
	weightRelevance    = 0.35
	weightAuthority    = 0.20
	weightFreshness    = 0.20
	weightIndependence = 0.15
	weightUtility      = 0.10
)

// freshnessHalfLifeHours maps a freshness class to its exponential-decay
// half-life. Unknown classes degrade like law: slowly, never fresh.
func freshnessHalfLifeHours(class string) float64 {
	switch class {
	case "price":
		return 24
	case "version":
		return 720
	case "law":
		return 168
	case "static":
		return 8760
	default:
		return 168
	}
}

// AuthorityWeight maps a source tier to its score component.
func AuthorityWeight(t AuthorityTier) float64 {
	switch t {
	case AuthorityPrimary:
		return 1.0
	case AuthorityReputable:
		return 0.8
	case AuthorityAggregator:
		return 0.5
	case AuthorityDenied:
		return 0.0
	default:
		return 0.3
	}
}

// Relevance is the share of distinct query terms present in the chunk
// (case-insensitive, punctuation-blind, single letters ignored). A stopgap
// until BM25 over query terms lands: it makes the 0.35 relevance weight
// discriminate instead of tying every chunk at zero.
func Relevance(query, text string) float64 {
	q := termSet(query)
	if len(q) == 0 {
		return 0
	}
	t := termSet(text)
	hit := 0
	for w := range q {
		if t[w] {
			hit++
		}
	}
	return float64(hit) / float64(len(q))
}

func termSet(s string) map[string]bool {
	set := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return r < 'a' || r > 'z'
	}) {
		if len(w) >= 2 {
			set[w] = true
		}
	}
	return set
}

// ScoreInput carries the per-request scoring context.
type ScoreInput struct {
	Now            time.Time
	FreshnessClass string
	Utility        func(domain string) float64
}

// Score fills a chunk's Freshness, Independence, Utility, and Score fields.
// Deterministic: identical chunk + input yields an identical record; ties
// elsewhere break on content hash, and the total rounds to 6 decimals.
func Score(c Chunk, in ScoreInput) Chunk {
	class := in.FreshnessClass
	if class == "" {
		class = c.FreshnessClass
	}
	ageHours := in.Now.Sub(c.FetchedAt).Hours()
	if ageHours < 0 {
		ageHours = 0
	}
	c.Freshness = math.Exp(-ageHours / freshnessHalfLifeHours(class))
	size := c.ClusterSize
	if size < 1 {
		size = 1
	}
	c.Independence = 1 / float64(size)
	utility := 0.5
	if in.Utility != nil {
		utility = in.Utility(c.Domain)
	}
	c.Utility = utility
	c.Score = round6(weightRelevance*c.Relevance +
		weightAuthority*AuthorityWeight(c.Authority) +
		weightFreshness*c.Freshness +
		weightIndependence*c.Independence +
		weightUtility*c.Utility)
	return c
}

func round6(f float64) float64 { return math.Round(f*1e6) / 1e6 }
