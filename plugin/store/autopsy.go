package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// GetAutopsy loads one cached ablation result. A missing row reports
// found=false with a nil error — absence of evidence is not a failure.
func (s *Store) GetAutopsy(ctx context.Context, reqID, chunkID string) (resultJSON string, createdAt int64, found bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT result, created_at FROM autopsy_cache WHERE request_id = ? AND chunk_id = ?`,
		reqID, chunkID).Scan(&resultJSON, &createdAt)
	if err == sql.ErrNoRows {
		return "", 0, false, nil
	}
	if err != nil {
		return "", 0, false, fmt.Errorf("store: %w", err)
	}
	return resultJSON, createdAt, true, nil
}

// SetAutopsy upserts one ablation result, stamping created_at in unix seconds.
func (s *Store) SetAutopsy(ctx context.Context, reqID, chunkID, resultJSON string) error {
	if reqID == "" || chunkID == "" {
		return fmt.Errorf("store: request and chunk ids required")
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO autopsy_cache(request_id, chunk_id, result, created_at) VALUES(?,?,?,?)
		 ON CONFLICT(request_id, chunk_id) DO UPDATE SET result = excluded.result, created_at = excluded.created_at`,
		reqID, chunkID, resultJSON, time.Now().Unix())
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	return nil
}
