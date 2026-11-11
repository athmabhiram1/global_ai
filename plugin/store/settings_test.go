package store

import (
	"context"
	"errors"
	"testing"
)

// Task 2: settings roundtrip over the Task 1 contract
// (missing key → ErrNotFound).
func TestSettingsRoundTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	if err := s.SetSetting(ctx, "mode", "rewrite"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}
	got, err := s.GetSetting(ctx, "mode")
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if got != "rewrite" {
		t.Fatalf("GetSetting = %q, want %q", got, "rewrite")
	}
	if err := s.SetSetting(ctx, "mode", "annotate"); err != nil {
		t.Fatalf("SetSetting overwrite: %v", err)
	}
	got, err = s.GetSetting(ctx, "mode")
	if err != nil {
		t.Fatalf("GetSetting after overwrite: %v", err)
	}
	if got != "annotate" {
		t.Fatalf("GetSetting after overwrite = %q, want %q", got, "annotate")
	}
}

func TestSettingsMissingReturnsNotFound(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.GetSetting(context.Background(), "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetSetting missing = %v, want ErrNotFound", err)
	}
}
