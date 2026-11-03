// FROZEN — Wave 2 sidecar reputation/feedback tests. Do not edit without a plan amendment.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/store"
)

type reputationRow struct {
	Domain string
	Alpha  float64
	Beta   float64
	Denied bool
}

func openReputationTestServer(t *testing.T, token string) *Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "reputation.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return NewServer(st, token, "")
}

func postJSON(t *testing.T, s *Server, path, body, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func getReputationRows(t *testing.T, s *Server, token string) []reputationRow {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/reputation", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET reputation status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var rows []reputationRow
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode reputation list: %v (body %s)", err, rec.Body.String())
	}
	return rows
}

func findRow(rows []reputationRow, domain string) (reputationRow, bool) {
	for _, r := range rows {
		if r.Domain == domain {
			return r, true
		}
	}
	return reputationRow{}, false
}

func TestFeedbackChangesPosterior(t *testing.T) {
	s := openReputationTestServer(t, "")
	rec := postJSON(t, s, "/api/context-curator/feedback", `{"domain":"example.com","positive":true}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("POST feedback status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	row, ok := findRow(getReputationRows(t, s, ""), "example.com")
	if !ok {
		t.Fatal("example.com missing from reputation list after feedback")
	}
	if row.Alpha != 2 || row.Beta != 1 {
		t.Fatalf("posterior = (alpha=%v beta=%v), want (2 1) after one positive", row.Alpha, row.Beta)
	}
	rec = postJSON(t, s, "/api/context-curator/feedback", `{"domain":"example.com","positive":false}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("POST negative feedback status = %d, want 200", rec.Code)
	}
	row, _ = findRow(getReputationRows(t, s, ""), "example.com")
	if row.Alpha != 2 || row.Beta != 2 {
		t.Fatalf("posterior = (alpha=%v beta=%v), want (2 2) after negative", row.Alpha, row.Beta)
	}
}

func TestResetRestoresPrior(t *testing.T) {
	s := openReputationTestServer(t, "")
	if rec := postJSON(t, s, "/api/context-curator/feedback", `{"domain":"example.com","positive":true}`, ""); rec.Code != http.StatusOK {
		t.Fatalf("POST feedback status = %d", rec.Code)
	}
	if rec := postJSON(t, s, "/api/context-curator/reputation/reset", `{"domain":"example.com"}`, ""); rec.Code != http.StatusOK {
		t.Fatalf("POST reset status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	row, ok := findRow(getReputationRows(t, s, ""), "example.com")
	if !ok {
		t.Fatal("example.com missing from reputation list after reset")
	}
	if row.Alpha != 1 || row.Beta != 1 || row.Denied {
		t.Fatalf("after reset = (alpha=%v beta=%v denied=%v), want (1 1 false)", row.Alpha, row.Beta, row.Denied)
	}
}

func TestProtectedRoutesRequireAuth(t *testing.T) {
	s := openReputationTestServer(t, "secret")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/reputation", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("GET reputation without token = %d, want 401", rec.Code)
	}
	rec = postJSON(t, s, "/api/context-curator/feedback", `{"domain":"example.com","positive":true}`, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("POST feedback without token = %d, want 401", rec.Code)
	}
	rows := getReputationRows(t, s, "secret")
	if len(rows) != 0 {
		t.Fatalf("fresh reputation list has %d rows, want 0", len(rows))
	}
}
