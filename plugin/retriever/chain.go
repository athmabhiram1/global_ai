package retriever

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// searchResponse mirrors the Tavily envelope the pipeline accounts credits from.
type searchResponse struct {
	Results []Result `json:"results"`
	Usage   struct {
		Credits int `json:"credits"`
	} `json:"usage"`
}

func decodeResults(resp *http.Response) ([]Result, error) {
	var sr searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, fmt.Errorf("retriever: decode: %w", err)
	}
	return spreadCredits(sr.Results, sr.Usage.Credits), nil
}

// Chain tries transports in order, each exactly once, and reports which one
// served the call. The first success wins; if all fail, the last error is
// returned so the caller can mark the degradation precisely.
type Chain struct {
	order  []string
	byName map[string]Retriever
}

// NewChain builds a chain over the named transports in attempt order.
func NewChain(order []string, rs map[string]Retriever) *Chain {
	return &Chain{order: order, byName: rs}
}

func (c *Chain) Search(ctx context.Context, q Query) ([]Result, string, error) {
	var lastErr error
	for _, name := range c.order {
		r, ok := c.byName[name]
		if !ok || r == nil {
			lastErr = fmt.Errorf("retriever: unknown transport %q", name)
			continue
		}
		res, err := r.Search(ctx, q)
		if err == nil {
			return res, r.Name(), nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("retriever: no transports configured")
	}
	return nil, "", lastErr
}

// Extract mirrors Search for content extraction.
func (c *Chain) Extract(ctx context.Context, urls []string, q string) ([]Result, string, error) {
	var lastErr error
	for _, name := range c.order {
		r, ok := c.byName[name]
		if !ok || r == nil {
			lastErr = fmt.Errorf("retriever: unknown transport %q", name)
			continue
		}
		res, err := r.Extract(ctx, urls, q)
		if err == nil {
			return res, r.Name(), nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("retriever: no transports configured")
	}
	return nil, "", lastErr
}
