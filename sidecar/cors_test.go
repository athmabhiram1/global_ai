package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// New behavior: the demo UI calls the API from a browser.
func TestCORSHeadersOnAPI(t *testing.T) {
	s := NewServer(nil, "", "")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("missing CORS allow-origin header")
	}
}

func TestCORSPreflight(t *testing.T) {
	s := NewServer(nil, "", "")
	req := httptest.NewRequest(http.MethodOptions, "/api/context-curator/decisions", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight = %d, want 204", rec.Code)
	}
}
