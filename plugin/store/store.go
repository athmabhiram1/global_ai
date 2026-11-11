// Package store persists admission records in SQLite. One file, one writer
// discipline: the plugin writes decisions and verdicts, the sidecar writes
// reputation, autopsy, and claims — no table has two writers, so WAL
// contention stays theoretical. Every pooled connection carries the same
// PRAGMAs via the DSN, and the pool is serialized to a single connection.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS decisions (
  request_id TEXT PRIMARY KEY,
  created_at INTEGER,
  decision   TEXT,
  request    TEXT
);
CREATE TABLE IF NOT EXISTS reputation (
  domain TEXT PRIMARY KEY,
  alpha REAL, beta REAL,
  last_seen INTEGER, denied INTEGER
);
CREATE TABLE IF NOT EXISTS verdict_cache (
  content_hash TEXT, max_age_hours INTEGER,
  verdict TEXT, fetched_at INTEGER,
  PRIMARY KEY (content_hash, max_age_hours)
);
CREATE TABLE IF NOT EXISTS autopsy_cache (
  request_id TEXT, chunk_id TEXT,
  result TEXT, created_at INTEGER,
  PRIMARY KEY (request_id, chunk_id)
);
CREATE TABLE IF NOT EXISTS claims (
  content_hash TEXT, claim TEXT,
  freshness REAL, evidence TEXT, created_at INTEGER,
  PRIMARY KEY (content_hash, claim)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

// Store is a SQLite-backed decision and learning record.
type Store struct {
	db *sql.DB
}

// Open creates the parent directory, opens the database in WAL mode with a
// 5 s busy timeout, and ensures the schema.
func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: %w", err)
	}
	if _, err := db.ExecContext(ctx, schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: schema: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the database.
func (s *Store) Close() error { return s.db.Close() }

// SetSetting upserts one key-value setting (e.g. the live policy mode).
func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO settings(key, value) VALUES(?,?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		key, value)
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	return nil
}

// GetSetting loads one setting. A missing key returns ErrNotFound.
func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		`SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("store: %w", err)
	}
	return value, nil
}

// InsertDecision records one admission decision with its redacted request.
// An empty request id is rejected: silent "" primary keys would collide.
func (s *Store) InsertDecision(ctx context.Context, d model.Decision, req string) error {
	if d.RequestID == "" {
		return fmt.Errorf("store: request id required")
	}
	raw, err := json.Marshal(d)
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO decisions(request_id, created_at, decision, request) VALUES(?,?,?,?)`,
		d.RequestID, time.Now().Unix(), string(raw), req)
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	return nil
}

// GetDecision loads one decision and its redacted request.
func (s *Store) GetDecision(ctx context.Context, id string) (model.Decision, string, error) {
	var raw, req string
	var d model.Decision
	err := s.db.QueryRowContext(ctx,
		`SELECT decision, request FROM decisions WHERE request_id = ?`, id).Scan(&raw, &req)
	if err != nil {
		return d, "", fmt.Errorf("store: %w", err)
	}
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return d, "", fmt.Errorf("store: %w", err)
	}
	return d, req, nil
}

// RecentDecisions returns the newest decisions first, capped at limit.
// Insertion order (rowid) breaks created_at ties from same-second writes.
func (s *Store) RecentDecisions(ctx context.Context, limit int) ([]model.Decision, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT decision FROM decisions ORDER BY rowid DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	defer rows.Close()
	out := []model.Decision{}
	for rows.Next() {
		var raw string
		var d model.Decision
		if err := rows.Scan(&raw); err != nil {
			return nil, fmt.Errorf("store: %w", err)
		}
		if err := json.Unmarshal([]byte(raw), &d); err != nil {
			return nil, fmt.Errorf("store: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}
	return out, nil
}
