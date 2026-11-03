package retriever

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// relayRetriever calls Tavily through the Bifrost relay. The relay injects
// the credential, so no Authorization header is ever sent from here.
type relayRetriever struct {
	baseURL string
	name    string
	client  *http.Client
}

// NewRelay returns a relay Tavily retriever. baseURL is the Bifrost HTTP
// address, name the relay name from policy (e.g. "tavily").
func NewRelay(baseURL, name string, client *http.Client) Retriever {
	if client == nil {
		client = &http.Client{Timeout: defaultTimeout}
	}
	return &relayRetriever{baseURL: strings.TrimRight(baseURL, "/"), name: name, client: client}
}

func (r *relayRetriever) Name() string { return "relay" }

func (r *relayRetriever) Search(ctx context.Context, q Query) ([]Result, error) {
	q = withDefaults(q)
	body, _ := json.Marshal(map[string]any{
		"query":           q.Text,
		"search_depth":    q.SearchDepth,
		"max_results":     q.MaxResults,
		"max_age_hours":   q.MaxAgeHours,
		"include_domains": q.IncludeDomains,
	})
	return r.post(ctx, r.baseURL+"/relay/"+r.name+"/search", body)
}

func (r *relayRetriever) Extract(ctx context.Context, urls []string, q string) ([]Result, error) {
	body, _ := json.Marshal(map[string]any{
		"urls":              urls,
		"query":             q,
		"extract_depth":     "basic",
		"chunks_per_source": 3,
	})
	return r.post(ctx, r.baseURL+"/relay/"+r.name+"/extract", body)
}

func (r *relayRetriever) post(ctx context.Context, url string, body []byte) ([]Result, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("retriever: relay status %d", resp.StatusCode)
	}
	return decodeResults(resp)
}
