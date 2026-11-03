// FROZEN — DO NOT EDIT. Task 1.8 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package retriever

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeRetriever struct {
	name    string
	results []Result
	err     error
	calls   int
}

func (f *fakeRetriever) Name() string { return f.name }
func (f *fakeRetriever) Search(_ context.Context, _ Query) ([]Result, error) {
	f.calls++
	return f.results, f.err
}
func (f *fakeRetriever) Extract(_ context.Context, _ []string, _ string) ([]Result, error) {
	f.calls++
	return f.results, f.err
}

func jsonServer(captured *map[string]any, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		*captured = m
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}
}

func pathRecorder(got *string, body string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		*got = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}
}

func TestChainFallsBack(t *testing.T) {
	c := NewChain([]string{"relay", "http"}, map[string]Retriever{
		"relay": &fakeRetriever{name: "relay", err: errors.New("down")},
		"http":  &fakeRetriever{name: "http", results: []Result{{URL: "https://x"}}},
	})
	res, used, err := c.Search(context.Background(), Query{Text: "q"})
	if err != nil || used != "http" || len(res) != 1 {
		t.Fatalf("got %v %q %d, want http with 1 result", err, used, len(res))
	}
}

func TestHTTPSendsMaxAge(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(jsonServer(&body, `{"results":[{"url":"https://x","content":"c"}],"usage":{"credits":1}}`))
	defer srv.Close()
	_, err := NewHTTP(srv.URL, "k", srv.Client()).Search(context.Background(), Query{Text: "q", MaxAgeHours: 24})
	if err != nil {
		t.Fatal(err)
	}
	if body["max_age_hours"] != float64(24) {
		t.Fatalf("max_age_hours = %v, want 24", body["max_age_hours"])
	}
}

func TestHTTPSendsBearerAuth(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()
	_, _ = NewHTTP(srv.URL, "secret-key", srv.Client()).Search(context.Background(), Query{Text: "q"})
	if gotAuth != "Bearer secret-key" {
		t.Fatalf("Authorization = %q, want Bearer secret-key", gotAuth)
	}
}

func TestRelayUsesRelayPath(t *testing.T) {
	var got string
	srv := httptest.NewServer(pathRecorder(&got, `{"results":[]}`))
	defer srv.Close()
	_, _ = NewRelay(srv.URL, "tavily", srv.Client()).Search(context.Background(), Query{Text: "q"})
	if got != "/relay/tavily/search" {
		t.Fatalf("path = %q, want /relay/tavily/search", got)
	}
}

func TestRelaySendsNoAuthHeader(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()
	_, _ = NewRelay(srv.URL, "tavily", srv.Client()).Search(context.Background(), Query{Text: "q"})
	if gotAuth != "" {
		t.Fatalf("Authorization = %q, want empty (relay injects credential)", gotAuth)
	}
}

func TestRelayFallsBackOnServerError(t *testing.T) {
	c := NewChain([]string{"relay", "http"}, map[string]Retriever{
		"relay": &fakeRetriever{name: "relay", err: errors.New("500")},
		"http":  &fakeRetriever{name: "http", results: []Result{{URL: "https://y"}}},
	})
	res, used, err := c.Search(context.Background(), Query{Text: "q"})
	if err != nil || used != "http" || len(res) != 1 {
		t.Fatalf("got %v %q %d", err, used, len(res))
	}
}

func TestEachTransportTriedOnce(t *testing.T) {
	relay := &fakeRetriever{name: "relay", err: errors.New("down")}
	httpR := &fakeRetriever{name: "http", err: errors.New("down")}
	c := NewChain([]string{"relay", "http"}, map[string]Retriever{"relay": relay, "http": httpR})
	_, _, _ = c.Search(context.Background(), Query{Text: "q"})
	if relay.calls != 1 || httpR.calls != 1 {
		t.Fatalf("calls relay=%d http=%d, want 1 each", relay.calls, httpR.calls)
	}
}

func TestAllTransportsFail(t *testing.T) {
	c := NewChain([]string{"relay"}, map[string]Retriever{"relay": &fakeRetriever{name: "relay", err: errors.New("down")}})
	if _, _, err := c.Search(context.Background(), Query{Text: "q"}); err == nil {
		t.Fatal("expected error when every transport fails")
	}
}

func TestExtractPostsURLs(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(jsonServer(&body, `{"results":[{"url":"https://x","raw_content":"r"}]}`))
	defer srv.Close()
	res, err := NewHTTP(srv.URL, "k", srv.Client()).Extract(context.Background(), []string{"https://x"}, "claim")
	if err != nil || len(res) != 1 || res[0].RawContent != "r" {
		t.Fatalf("got %+v %v", res, err)
	}
	urls, _ := body["urls"].([]any)
	if len(urls) != 1 || urls[0] != "https://x" {
		t.Fatalf("urls = %v", body["urls"])
	}
}
