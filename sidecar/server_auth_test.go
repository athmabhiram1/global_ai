package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Bearer auth compares the full header value in constant time: token
// comparison must be exact, never case-insensitive.
func TestRequireAuthIsCaseSensitive(t *testing.T) {
	s := NewServer(nil, "SeCrEt", "")
	h := s.Handler()

	serve := func(auth string) int {
		req := httptest.NewRequest(http.MethodGet, "/api/context-curator/reputation", nil)
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := serve("Bearer SeCrEt"); code != http.StatusServiceUnavailable {
		t.Fatalf("exact token = %d, want 503 (auth passed, store nil)", code)
	}
	if code := serve("Bearer secret"); code != http.StatusUnauthorized {
		t.Fatalf("wrong-case token = %d, want 401", code)
	}
	if code := serve(""); code != http.StatusUnauthorized {
		t.Fatalf("missing token = %d, want 401", code)
	}
}
