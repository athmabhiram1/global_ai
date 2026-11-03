// Package retriever fetches fresh evidence from Tavily, either through the
// Bifrost relay (preferred: Bifrost prices and logs the call) or direct
// HTTPS (the guaranteed path). The chain tries each transport once, in
// order, and never blocks the caller on Tavily: every failure degrades to
// the next transport, and the last error surfaces only when all fail.
package retriever

import "context"

// Result is one evidence unit from a search or extract call.
type Result struct {
	URL        string `json:"url"`
	Content    string `json:"content"`
	RawContent string `json:"raw_content"`
	Credits    int    `json:"credits"`
}

// Query scopes a retrieval call.
type Query struct {
	Text           string   `json:"query"`
	MaxAgeHours    int      `json:"max_age_hours"`
	SearchDepth    string   `json:"search_depth"`
	IncludeDomains []string `json:"include_domains"`
	MaxResults     int      `json:"max_results"`
}

// Retriever is one Tavily transport.
type Retriever interface {
	Name() string
	Search(ctx context.Context, q Query) ([]Result, error)
	Extract(ctx context.Context, urls []string, q string) ([]Result, error)
}

func withDefaults(q Query) Query {
	if q.SearchDepth == "" {
		q.SearchDepth = "basic"
	}
	if q.MaxResults <= 0 {
		q.MaxResults = 5
	}
	return q
}

// spreadCredits attributes request-level credits across results deterministically.
func spreadCredits(results []Result, total int) []Result {
	if len(results) == 0 {
		return results
	}
	per, rem := total/len(results), total%len(results)
	for i := range results {
		results[i].Credits = per
		if i < rem {
			results[i].Credits++
		}
	}
	return results
}
