// Package main serves the Context Curator sidecar API and UI.
//
// This file is shared vocabulary: the Server shape, the route table, auth,
// and the cross-file data types. Business logic lives in the owner files:
// api.go (decisions, policy), replayer.go, diff.go, autopsy.go, claims.go,
// reputation.go. Parallel workers: implement your handlers only — do not
// change this file's types, routes, or helpers.
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/athmabhiram/context-curator/plugin/retriever"
	"github.com/athmabhiram/context-curator/plugin/store"
)

// Replayer replays a recorded request with one chunk removed.
type Replayer interface {
	Replay(ctx context.Context, req string, dropChunk string) (string, error)
}

// Diff is a sentence-level alignment of two answers.
type Diff struct {
	Changed []string `json:"changed"`
	Added   []string `json:"added"`
	Removed []string `json:"removed"`
	Total   int      `json:"total"`
}

// AutopsyRequest identifies one counterfactual ablation.
type AutopsyRequest struct {
	RequestID string `json:"request_id"`
	ChunkID   string `json:"chunk_id"`
}

// AutopsyResult is the cached outcome of one ablation pair.
type AutopsyResult struct {
	Influence float64 `json:"influence"`
	Diff      Diff    `json:"diff"`
	With      string  `json:"with"`
	Without   string  `json:"without"`
	Cached    bool    `json:"cached"`
}

// Claim is one extracted assertion with its freshness evidence.
type Claim struct {
	Text      string   `json:"text"`
	Source    string   `json:"source"`
	Freshness float64  `json:"freshness"`
	Evidence  []string `json:"evidence"`
}

// Server serves the sidecar API. A nil Store disables persistence-backed
// routes (they answer 503); an empty Token disables auth (tests).
type Server struct {
	Store      *store.Store
	Token      string
	PolicyJSON string
	Replayer   Replayer
	// Retriever is the Tavily chain for claims scoring. Tests inject a stub;
	// production falls back to tavilyChainFromEnv when nil (see claims.go).
	Retriever retriever.Retriever

	mu     sync.Mutex
	claims map[string]Claim
}

// NewServer wires routes over the given store. policyJSON is served verbatim
// at /api/context-curator/policy.
func NewServer(st *store.Store, token, policyJSON string) *Server {
	return &Server{Store: st, Token: token, PolicyJSON: policyJSON, claims: map[string]Claim{}}
}

// Handler returns the full route table. Method handlers live in the owner
// files; this table is the contract — do not rewire it per task.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/context-curator/policy", s.requireAuth(s.handlePolicy))
	mux.HandleFunc("GET /api/context-curator/decisions", s.requireAuth(s.handleDecisions))
	mux.HandleFunc("GET /api/context-curator/decisions/{id}", s.requireAuth(s.handleDecision))
	mux.HandleFunc("GET /api/context-curator/reputation", s.requireAuth(s.handleReputation))
	mux.HandleFunc("POST /api/context-curator/reputation/reset", s.requireAuth(s.handleReputationReset))
	mux.HandleFunc("POST /api/context-curator/feedback", s.requireAuth(s.handleFeedback))
	mux.HandleFunc("POST /api/context-curator/deny", s.requireAuth(s.handleDeny))
	mux.HandleFunc("POST /api/context-curator/policy/mode", s.requireAuth(s.handlePolicyMode))
	mux.HandleFunc("GET /api/context-curator/policy/summary", s.requireAuth(s.handlePolicySummary))
	mux.HandleFunc("POST /api/context-curator/autopsy", s.requireAuth(s.handleAutopsy))
	mux.HandleFunc("GET /api/context-curator/claims/{hash}", s.requireAuth(s.handleClaim))
	mux.HandleFunc("POST /api/context-curator/claims/score", s.requireAuth(s.handleClaimsScore))
	return cors(mux)
}

// cors allows the browser-based demo UI (opened as a plain file or served
// from anywhere) to call the API directly. The API carries no cookies, so a
// wildcard origin is sufficient; auth still uses the Bearer [REDACTED]
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "cc-sidecar"})
}

func (s *Server) handlePolicy(w http.ResponseWriter, _ *http.Request) {
	if s.PolicyJSON == "" {
		s.writeErr(w, http.StatusServiceUnavailable, "no policy loaded")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(s.PolicyJSON))
}

// requireAuth enforces Bearer CC_ADMIN_TOKEN. Empty Token means open (tests).
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.Token == "" {
			next(w, r)
			return
		}
		if !strings.EqualFold(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), s.Token) ||
			!strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			s.writeErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}

func (s *Server) writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) writeErr(w http.ResponseWriter, code int, msg string) {
	s.writeJSON(w, code, map[string]string{"error": msg})
}
