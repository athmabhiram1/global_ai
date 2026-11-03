package retriever

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// defaultTimeout bounds one transport attempt. Tavily degradation must be
// fast: a slow transport fails over, it never stalls admission.
const defaultTimeout = 900 * time.Millisecond

// httpRetriever calls the Tavily REST API directly with a bearer key.
type httpRetriever struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

// NewHTTP returns a direct-HTTPS Tavily retriever. A nil client gets a
// default one with the per-attempt timeout.
func NewHTTP(baseURL, apiKey string, client *http.Client) Retriever {
	if client == nil {
		client = &http.Client{Timeout: defaultTimeout}
	}
	return &httpRetriever{baseURL: baseURL, apiKey: apiKey, client: client}
}

func (r *httpRetriever) Name() string { return "http" }

func (r *httpRetriever) Search(ctx context.Context, q Query) ([]Result, error) {
	q = withDefaults(q)
	body, _ := json.Marshal(map[string]any{
		"query":           q.Text,
		"search_depth":    q.SearchDepth,
		"max_results":     q.MaxResults,
		"max_age_hours":   q.MaxAgeHours,
		"include_domains": q.IncludeDomains,
	})
	return r.post(ctx, r.baseURL+"/search", body, map[string]string{
		"Authorization": "Bearer " + r.apiKey,
	})
}

func (r *httpRetriever) Extract(ctx context.Context, urls []string, q string) ([]Result, error) {
	body, _ := json.Marshal(map[string]any{
		"urls":              urls,
		"query":             q,
		"extract_depth":     "basic",
		"chunks_per_source": 3,
	})
	return r.post(ctx, r.baseURL+"/extract", body, map[string]string{
		"Authorization": "Bearer " + r.apiKey,
	})
}

func (r *httpRetriever) post(ctx context.Context, url string, body []byte, headers map[string]string) ([]Result, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("retriever: tavily http status %d", resp.StatusCode)
	}
	return decodeResults(resp)
}
