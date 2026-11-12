package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
	"github.com/athmabhiram/context-curator/plugin/store"
)

// priorReputation is the Beta(1,1) prior every domain resets to.
func priorReputation(domain string, now time.Time) model.Reputation {
	return model.Reputation{Domain: domain, Alpha: 1, Beta: 1, LastSeen: now}
}

func (s *Server) handleReputation(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	rows, err := s.Store.ListReputations(r.Context())
	if err != nil {
		s.writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []model.Reputation{}
	}
	s.writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleReputationReset(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	var body struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		s.writeErr(w, http.StatusBadRequest, "invalid reset request")
		return
	}
	ctx := r.Context()
	now := time.Now()
	if body.Domain != "" {
		prior := priorReputation(body.Domain, now)
		if err := s.Store.SetReputation(ctx, prior); err != nil {
			s.writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		s.writeJSON(w, http.StatusOK, []model.Reputation{prior})
		return
	}
	rows, err := s.Store.ListReputations(ctx)
	if err != nil {
		s.writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	reset := make([]model.Reputation, 0, len(rows))
	for _, row := range rows {
		prior := priorReputation(row.Domain, now)
		if err := s.Store.SetReputation(ctx, prior); err != nil {
			s.writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		reset = append(reset, prior)
	}
	s.writeJSON(w, http.StatusOK, reset)
}

func (s *Server) handleFeedback(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	var body struct {
		Domain   string `json:"domain"`
		Positive bool   `json:"positive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeErr(w, http.StatusBadRequest, "invalid feedback request")
		return
	}
	if body.Domain == "" {
		s.writeErr(w, http.StatusBadRequest, "domain required")
		return
	}
	body.Domain = normalizeDomain(body.Domain)
	if body.Domain == "" {
		s.writeErr(w, http.StatusBadRequest, "domain required")
		return
	}
	ctx := r.Context()
	rep, err := s.Store.GetReputation(ctx, body.Domain)
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			s.writeErr(w, http.StatusInternalServerError, "store error")
			return
		}
		rep = priorReputation(body.Domain, time.Now())
	}
	if body.Positive {
		if rep.Alpha < 10000 {
			rep.Alpha++
		}
	} else {
		if rep.Beta < 10000 {
			rep.Beta++
		}
	}
	rep.LastSeen = time.Now()
	if err := s.Store.SetReputation(ctx, rep); err != nil {
		s.writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	s.writeJSON(w, http.StatusOK, rep)
}
