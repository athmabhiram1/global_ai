// FROZEN — DO NOT EDIT. Task 2.1 store acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/model"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestDecisionRoundTrip(t *testing.T) {
	s := openTestStore(t)
	d := model.Decision{RequestID: "r1", ChunksIn: 3, ChunksKept: 1}
	if err := s.InsertDecision(context.Background(), d, `{"redacted":true}`); err != nil {
		t.Fatal(err)
	}
	got, req, err := s.GetDecision(context.Background(), "r1")
	if err != nil || got.ChunksIn != 3 {
		t.Fatalf("%v %+v", err, got)
	}
	if req != `{"redacted":true}` {
		t.Fatalf("request = %q", req)
	}
}

func TestRecentDecisionsNewestFirst(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	for _, id := range []string{"r1", "r2", "r3"} {
		if err := s.InsertDecision(ctx, model.Decision{RequestID: id}, "{}"); err != nil {
			t.Fatal(err)
		}
	}
	recent, err := s.RecentDecisions(ctx, 2)
	if err != nil || len(recent) != 2 {
		t.Fatalf("%v %d", err, len(recent))
	}
	if recent[0].RequestID != "r3" || recent[1].RequestID != "r2" {
		t.Fatalf("order = %q %q, want r3 r2", recent[0].RequestID, recent[1].RequestID)
	}
}

func TestGetMissingDecisionErrors(t *testing.T) {
	s := openTestStore(t)
	if _, _, err := s.GetDecision(context.Background(), "nope"); err == nil {
		t.Fatal("expected error for unknown request id")
	}
}

func TestDuplicateRequestIDErrors(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	d := model.Decision{RequestID: "r1"}
	if err := s.InsertDecision(ctx, d, "{}"); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertDecision(ctx, d, "{}"); err == nil {
		t.Fatal("expected primary-key error on duplicate request id")
	}
}

func TestOpenEnablesWAL(t *testing.T) {
	s := openTestStore(t)
	var mode string
	if err := s.db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Fatalf("journal_mode = %q, want wal", mode)
	}
}

func TestOpenSetsBusyTimeout(t *testing.T) {
	s := openTestStore(t)
	var timeout int
	if err := s.db.QueryRow("PRAGMA busy_timeout").Scan(&timeout); err != nil {
		t.Fatal(err)
	}
	if timeout != 5000 {
		t.Fatalf("busy_timeout = %d, want 5000", timeout)
	}
}

func TestRecentEmptyStore(t *testing.T) {
	s := openTestStore(t)
	recent, err := s.RecentDecisions(context.Background(), 10)
	if err != nil || len(recent) != 0 {
		t.Fatalf("%v %d, want empty", err, len(recent))
	}
}
