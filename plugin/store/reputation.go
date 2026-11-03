package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
)

// ErrNotFound reports a missing row. GetReputation returns it bare so both
// == and errors.Is comparisons match.
var ErrNotFound = errors.New("store: not found")

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// SetReputation inserts or overwrites one domain reputation. Denied persists
// as 0/1, LastSeen as unix seconds.
func (s *Store) SetReputation(ctx context.Context, r model.Reputation) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO reputation(domain, alpha, beta, last_seen, denied) VALUES(?,?,?,?,?)
		 ON CONFLICT(domain) DO UPDATE SET alpha=excluded.alpha, beta=excluded.beta,
		 last_seen=excluded.last_seen, denied=excluded.denied`,
		r.Domain, r.Alpha, r.Beta, r.LastSeen.Unix(), boolToInt(r.Denied))
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	return nil
}

// GetReputation loads one domain reputation. A missing domain returns
// ErrNotFound.
func (s *Store) GetReputation(ctx context.Context, domain string) (model.Reputation, error) {
	var r model.Reputation
	var lastSeen int64
	var denied int
	err := s.db.QueryRowContext(ctx,
		`SELECT domain, alpha, beta, last_seen, denied FROM reputation WHERE domain = ?`,
		domain).Scan(&r.Domain, &r.Alpha, &r.Beta, &lastSeen, &denied)
	if err == sql.ErrNoRows {
		return model.Reputation{}, ErrNotFound
	}
	if err != nil {
		return model.Reputation{}, fmt.Errorf("store: %w", err)
	}
	r.LastSeen = time.Unix(lastSeen, 0)
	r.Denied = denied != 0
	return r, nil
}

// ListReputations returns every domain reputation ordered by domain.
func (s *Store) ListReputations(ctx context.Context) ([]model.Reputation, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT domain, alpha, beta, last_seen, denied FROM reputation ORDER BY domain`)
	if err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	defer rows.Close()
	out := []model.Reputation{}
	for rows.Next() {
		var r model.Reputation
		var lastSeen int64
		var denied int
		if err := rows.Scan(&r.Domain, &r.Alpha, &r.Beta, &lastSeen, &denied); err != nil {
			return nil, fmt.Errorf("store: %w", err)
		}
		r.LastSeen = time.Unix(lastSeen, 0)
		r.Denied = denied != 0
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	return out, nil
}
