// Wave 2 Task 2.3: read-only decision routes. Auth and the route table live
// in server.go; this file only lists recent decisions and fetches one by id.
package main

import (
	"net/http"

	"github.com/athmabhiram/context-curator/plugin/model"
)

// defaultDecisionsLimit caps one listing so a long-lived store cannot blow up
// a single UI response.
const defaultDecisionsLimit = 50

// handleDecisions lists recent decisions, newest first. An empty store is a
// 200 with an empty list, not an error: no data is a valid state.
func (s *Server) handleDecisions(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	decisions, err := s.Store.RecentDecisions(r.Context(), defaultDecisionsLimit)
	if err != nil {
		s.writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if decisions == nil {
		decisions = []model.Decision{}
	}
	s.writeJSON(w, http.StatusOK, decisions)
}

// handleDecision returns one decision by request id. Unknown ids are a 404
// with the standard error envelope, never an empty 200.
func (s *Server) handleDecision(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	decision, _, err := s.Store.GetDecision(r.Context(), r.PathValue("id"))
	if err != nil {
		s.writeErr(w, http.StatusNotFound, "decision not found")
		return
	}
	s.writeJSON(w, http.StatusOK, decision)
}
