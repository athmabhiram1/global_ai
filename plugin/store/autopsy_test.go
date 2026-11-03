// FROZEN — Wave 2 Task 2.x store autopsy tests. Do not edit without a plan amendment.
package store

import (
	"context"
	"testing"
)

func TestGetAutopsyMissingReturnsNotFound(t *testing.T) {
	s := openTestStore(t)
	_, _, found, err := s.GetAutopsy(context.Background(), "req-1", "c1")
	if err != nil {
		t.Fatalf("GetAutopsy missing row: unexpected error %v", err)
	}
	if found {
		t.Fatal("GetAutopsy missing row: found = true, want false")
	}
}

func TestAutopsyRoundTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	want := `{"influence":0.5}`
	if err := s.SetAutopsy(ctx, "req-1", "c1", want); err != nil {
		t.Fatalf("SetAutopsy: %v", err)
	}
	got, createdAt, found, err := s.GetAutopsy(ctx, "req-1", "c1")
	if err != nil {
		t.Fatalf("GetAutopsy: %v", err)
	}
	if !found {
		t.Fatal("GetAutopsy: found = false, want true")
	}
	if got != want {
		t.Fatalf("GetAutopsy result = %q, want %q", got, want)
	}
	if createdAt <= 0 {
		t.Fatalf("GetAutopsy createdAt = %d, want unix seconds > 0", createdAt)
	}
}

func TestAutopsyOverwriteUpdates(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	if err := s.SetAutopsy(ctx, "req-1", "c1", `{"influence":0.1}`); err != nil {
		t.Fatalf("SetAutopsy v1: %v", err)
	}
	if err := s.SetAutopsy(ctx, "req-1", "c1", `{"influence":0.9}`); err != nil {
		t.Fatalf("SetAutopsy v2: %v", err)
	}
	got, _, found, err := s.GetAutopsy(ctx, "req-1", "c1")
	if err != nil || !found {
		t.Fatalf("GetAutopsy after overwrite: found=%v err=%v", found, err)
	}
	if got != `{"influence":0.9}` {
		t.Fatalf("GetAutopsy after overwrite = %q, want v2 payload", got)
	}
}
