package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Task 2: deny / policy-mode / policy-summary endpoints. Reuses the frozen
// helpers openSidecarTestStore, postJSON, getReputationRows and reputationRow
// (same package, read-only use).

const policyExtTestYAML = `context_curator:
  enabled: true
  mode: annotate # annotate | block | rewrite
  budget:
    max_context_tokens: 4000
    max_chunks: 8
    max_tavily_credits: 2
  freshness:
    default_max_age_hours: 168
    classes:
      price: 24
      version: 720
      law: 168
      static: 8760
  authority:
    allow: ["*.gov", "*.edu"]
    deny: ["content-farm.example"]
    require_primary_for: ["price"]
  independence:
    min_sources: 2
    near_duplicate_threshold: 0.85
  tavily:
    transport_order: [relay, http]
    search_depth: basic
    max_age_hours: 24
    timeout_ms: 900
  claims:
    enabled: true
    model: gpt-4o-mini
    max_claims_per_request: 12
  autopsy:
    max_ablations: 5
    cache_ttl_minutes: 60
`

func decodePolicyExtBody(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("decode response: %v (body %s)", err, rec.Body.String())
	}
}

func getPolicySummary(t *testing.T, s *Server) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/policy/summary", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	var body map[string]any
	if rec.Code == http.StatusOK {
		decodePolicyExtBody(t, rec, &body)
	}
	return rec.Code, body
}

func sectionMap(t *testing.T, body map[string]any, key string) map[string]any {
	t.Helper()
	sec, ok := body[key].(map[string]any)
	if !ok {
		t.Fatalf("summary[%q] missing or not an object: %v", key, body[key])
	}
	return sec
}

func TestDenySetsDeniedAndReturnsRow(t *testing.T) {
	s := NewServer(openSidecarTestStore(t), "", "")
	rec := postJSON(t, s, "/api/context-curator/deny", `{"domain":"evil.example","denied":true}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("POST deny = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var row reputationRow
	decodePolicyExtBody(t, rec, &row)
	if row.Domain != "evil.example" || !row.Denied {
		t.Fatalf("deny row = %+v, want domain evil.example denied=true", row)
	}
	if row.Alpha != 1 || row.Beta != 1 {
		t.Fatalf("deny row posterior = (%v %v), want fresh Beta(1,1)", row.Alpha, row.Beta)
	}
	// Persisted: visible in the reputation list.
	found := false
	for _, r := range getReputationRows(t, s, "") {
		if r.Domain == "evil.example" && r.Denied {
			found = true
		}
	}
	if !found {
		t.Fatal("evil.example not denied in reputation list after POST deny")
	}
	// denied:false clears.
	rec = postJSON(t, s, "/api/context-curator/deny", `{"domain":"evil.example","denied":false}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("POST undeny = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	decodePolicyExtBody(t, rec, &row)
	if row.Denied {
		t.Fatalf("undeny row = %+v, want denied=false", row)
	}
}

func TestDenyRequiresDomain(t *testing.T) {
	s := NewServer(openSidecarTestStore(t), "", "")
	for _, body := range []string{`{}`, `{"denied":true}`, `not-json`} {
		rec := postJSON(t, s, "/api/context-curator/deny", body, "")
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("POST deny %s = %d, want 400 (body %s)", body, rec.Code, rec.Body.String())
		}
	}
}

func TestPolicyModeValidatesAndPersists(t *testing.T) {
	st := openSidecarTestStore(t)
	s := NewServer(st, "", "")
	rec := postJSON(t, s, "/api/context-curator/policy/mode", `{"mode":"rewrite"}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("POST mode rewrite = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var body map[string]any
	decodePolicyExtBody(t, rec, &body)
	if body["mode"] != "rewrite" {
		t.Fatalf("mode response = %v, want mode=rewrite", body)
	}
	stored, err := st.GetSetting(context.Background(), "mode")
	if err != nil || stored != "rewrite" {
		t.Fatalf("stored mode = %q, %v; want rewrite", stored, err)
	}
	for _, bad := range []string{`{"mode":"turbo"}`, `{}`, `{"mode":""}`} {
		rec := postJSON(t, s, "/api/context-curator/policy/mode", bad, "")
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("POST mode %s = %d, want 400 (body %s)", bad, rec.Code, rec.Body.String())
		}
	}
	stored, err = st.GetSetting(context.Background(), "mode")
	if err != nil || stored != "rewrite" {
		t.Fatalf("stored mode after invalid posts = %q, %v; want rewrite", stored, err)
	}
}

func TestPolicyModeSummaryReturnsSections(t *testing.T) {
	st := openSidecarTestStore(t)
	s := NewServer(st, "", policyExtTestYAML)
	code, body := getPolicySummary(t, s)
	if code != http.StatusOK {
		t.Fatalf("GET policy/summary = %d, want 200", code)
	}
	if body["effective_mode"] != "annotate" {
		t.Fatalf("effective_mode = %v, want annotate (YAML default, nothing stored)", body["effective_mode"])
	}
	for _, key := range []string{"budget", "freshness", "authority", "independence", "tavily", "claims", "autopsy"} {
		sectionMap(t, body, key)
	}
	if got := sectionMap(t, body, "budget")["max_context_tokens"]; got != float64(4000) {
		t.Fatalf("budget.max_context_tokens = %v, want 4000", got)
	}
	classes, ok := sectionMap(t, body, "freshness")["classes"].(map[string]any)
	if !ok || classes["price"] != float64(24) {
		t.Fatalf("freshness.classes = %v, want price=24", sectionMap(t, body, "freshness")["classes"])
	}
	denyList, ok := sectionMap(t, body, "authority")["deny"].([]any)
	if !ok || len(denyList) != 1 || denyList[0] != "content-farm.example" {
		t.Fatalf("authority.deny = %v, want [content-farm.example]", sectionMap(t, body, "authority")["deny"])
	}
	if got := sectionMap(t, body, "independence")["min_sources"]; got != float64(2) {
		t.Fatalf("independence.min_sources = %v, want 2", got)
	}
	if got := sectionMap(t, body, "tavily")["search_depth"]; got != "basic" {
		t.Fatalf("tavily.search_depth = %v, want basic", got)
	}
	if got := sectionMap(t, body, "claims")["model"]; got != "gpt-4o-mini" {
		t.Fatalf("claims.model = %v, want gpt-4o-mini", got)
	}
	if got := sectionMap(t, body, "autopsy")["max_ablations"]; got != float64(5) {
		t.Fatalf("autopsy.max_ablations = %v, want 5", got)
	}
	// Stored mode overrides the YAML default.
	if err := st.SetSetting(context.Background(), "mode", "rewrite"); err != nil {
		t.Fatal(err)
	}
	code, body = getPolicySummary(t, s)
	if code != http.StatusOK {
		t.Fatalf("GET policy/summary after store = %d, want 200", code)
	}
	if body["effective_mode"] != "rewrite" {
		t.Fatalf("effective_mode = %v, want rewrite (stored override)", body["effective_mode"])
	}
	// GET /policy still serves the raw YAML verbatim.
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/policy", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET policy = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "context_curator:") {
		t.Fatalf("GET policy body changed: %q", rec.Body.String())
	}
}

func TestPolicyModeSummaryRequiresPolicy(t *testing.T) {
	s := NewServer(openSidecarTestStore(t), "", "")
	req := httptest.NewRequest(http.MethodGet, "/api/context-curator/policy/summary", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET policy/summary without policy = %d, want 503", rec.Code)
	}
}

func TestDenyNormalizesDomain(t *testing.T) {
	s := NewServer(openSidecarTestStore(t), "", policyExtTestYAML)
	rec := postJSON(t, s, "/api/context-curator/deny", `{"domain":"  EVIL.Example. ","denied":true}`, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("POST deny mixed-case = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var row map[string]any
	decodePolicyExtBody(t, rec, &row)
	if row["Domain"] != "evil.example" {
		t.Fatalf("deny stored domain = %v, want normalized %q", row["Domain"], "evil.example")
	}
	got, err := s.Store.GetReputation(context.Background(), "evil.example")
	if err != nil {
		t.Fatalf("GetReputation(normalized) = %v, want row", err)
	}
	if !got.Denied {
		t.Fatal("normalized row Denied = false, want true")
	}
}

func TestPolicySummaryHasModeAlias(t *testing.T) {
	s := NewServer(openSidecarTestStore(t), "", policyExtTestYAML)
	code, body := getPolicySummary(t, s)
	if code != http.StatusOK {
		t.Fatalf("GET policy/summary = %d, want 200", code)
	}
	if body["mode"] != body["effective_mode"] {
		t.Fatalf("summary mode = %v, want alias of effective_mode = %v", body["mode"], body["effective_mode"])
	}
}
