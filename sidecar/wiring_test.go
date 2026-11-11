// Production-wiring regression tests (2026-11-11).
//
// POST /api/context-curator/autopsy returned 500 on a stock container for
// two compounding reasons: main.go never attached a Replayer (every
// production autopsy failed with "no replayer"), and the handler mapped a
// client error (missing ids) to 500. POST /claims/score had the same
// class of problem: the shipped placeholder key ("unused") built a chain
// whose relay inevitably 401s, surfacing as 502 instead of the designed
// 503. These tests pin the production paths; unit behavior stays frozen.
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReplayerFromEnvDefaults(t *testing.T) {
	t.Setenv("BIFROST_URL", "")
	t.Setenv("CC_GATEWAY_TOKEN", "")
	r := replayerFromEnv()
	if r == nil {
		t.Fatal("replayerFromEnv with empty env: got nil, want a replayer")
	}
	if r.baseURL != "http://127.0.0.1:8080" {
		t.Fatalf("replayer baseURL = %q, want the in-container gateway default", r.baseURL)
	}
	if r.token != "" {
		t.Fatalf("replayer token = %q, want empty", r.token)
	}
}

func TestReplayerFromEnvHonoursOverrides(t *testing.T) {
	t.Setenv("BIFROST_URL", "http://gateway:8080/")
	t.Setenv("CC_GATEWAY_TOKEN", "gw-token")
	r := replayerFromEnv()
	if r.baseURL != "http://gateway:8080" {
		t.Fatalf("replayer baseURL = %q, want trimmed override", r.baseURL)
	}
	if r.token != "gw-token" {
		t.Fatalf("replayer token = %q, want override", r.token)
	}
}

func TestAutopsyHandlerRejectsMissingIDs(t *testing.T) {
	s := NewServer(openSidecarTestStore(t), "", "")
	for _, body := range []string{`{}`, `{"request_id":"r1"}`, `{"chunk_id":"c1"}`} {
		req := httptest.NewRequest(http.MethodPost, "/api/context-curator/autopsy", strings.NewReader(body))
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("POST autopsy %s = %d, want 400", body, rec.Code)
		}
	}
}

func TestClaimsScorePlaceholderKeyIs503(t *testing.T) {
	for _, key := range []string{"unused", "tvly-your-tavily-key-here", ""} {
		t.Setenv("TAVILY_API_KEY", key)
		s := NewServer(openSidecarTestStore(t), "", "")
		req := httptest.NewRequest(http.MethodPost, "/api/context-curator/claims/score",
			strings.NewReader(`{"text":"Pro is $49/seat/month."}`))
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("POST claims/score with key %q = %d, want 503", key, rec.Code)
		}
	}
}
