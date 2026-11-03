// FROZEN — Wave 2 Task 2.3 acceptance tests. Do not edit without a plan
// amendment: failing tests mean the handlers are wrong, never the tests.
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/model"
	"github.com/athmabhiram/context-curator/plugin/store"
)

func openSidecarTestStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func seedDecision(t *testing.T, s *store.Store, d model.Decision) {
	t.Helper()
	if err := s.InsertDecision(context.Background(), d, `{"roles":["user"]}`); err != nil {
		t.Fatal(err)
	}
}

func TestDecisionsEndpointListsSeededDecision(t *testing.T) {
	s := openSidecarTestStore(t)
	seedDecision(t, s, model.Decision{RequestID: "r1", ChunksIn: 3, ChunksKept: 1, Kept: []string{"c1"}})
	srv := NewServer(s, "", "")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET decisions = %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, "chunks_in") {
		t.Fatalf("decisions body missing chunks_in: %q", body)
	}
}

func TestDecisionsEmptyStoreReturnsEmptyList(t *testing.T) {
	s := openSidecarTestStore(t)
	srv := NewServer(s, "", "")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET decisions on empty store = %d, want 200", rec.Code)
	}
	if body := strings.TrimSpace(rec.Body.String()); body != "[]" {
		t.Fatalf("empty decisions body = %q, want []", body)
	}
}

func TestDecisionByIDReturnsSeededDecision(t *testing.T) {
	s := openSidecarTestStore(t)
	seedDecision(t, s, model.Decision{RequestID: "r9", ChunksIn: 2, ChunksKept: 2, Kept: []string{"a", "b"}})
	srv := NewServer(s, "", "")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions/r9", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET decision r9 = %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, "r9") {
		t.Fatalf("decision body missing request id: %q", body)
	}
}

func TestDecisionMissingIDReturns404Envelope(t *testing.T) {
	s := openSidecarTestStore(t)
	srv := NewServer(s, "", "")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions/nope", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET decision nope = %d, want 404", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, "error") {
		t.Fatalf("404 body missing error envelope: %q", body)
	}
}

func TestDecisionsBearerAuth(t *testing.T) {
	s := openSidecarTestStore(t)
	locked := NewServer(s, "secret-token", "")
	open := NewServer(s, "", "")

	for _, tc := range []struct {
		name  string
		token string
		want  int
	}{
		{"missing header rejected", "", http.StatusUnauthorized},
		{"bad token rejected", "Bearer wrong", http.StatusUnauthorized},
		{"good token allowed", "Bearer secret-token", http.StatusOK},
	} {
		req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions", nil)
		if tc.token != "" {
			req.Header.Set("Authorization", tc.token)
		}
		rec := httptest.NewRecorder()
		locked.Handler().ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Fatalf("%s: got %d, want %d", tc.name, rec.Code, tc.want)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/decisions", nil)
	rec := httptest.NewRecorder()
	open.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("open server without header = %d, want 200", rec.Code)
	}
}
