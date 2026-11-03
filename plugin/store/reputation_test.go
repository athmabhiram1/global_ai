// FROZEN — Wave 2 Task 2.2 store reputation tests. Do not edit without a plan amendment.
package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
)

func TestReputationRoundTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	want := model.Reputation{
		Domain: "a.example", Alpha: 3, Beta: 2,
		LastSeen: time.Unix(1700000000, 0).UTC(), Denied: true,
	}
	if err := s.SetReputation(ctx, want); err != nil {
		t.Fatalf("SetReputation: %v", err)
	}
	got, err := s.GetReputation(ctx, "a.example")
	if err != nil {
		t.Fatalf("GetReputation: %v", err)
	}
	if got.Domain != want.Domain || got.Alpha != want.Alpha || got.Beta != want.Beta {
		t.Fatalf("GetReputation = %+v, want %+v", got, want)
	}
	if !got.Denied {
		t.Fatalf("GetReputation denied = false, want true (roundtrip): %+v", got)
	}
	if got.LastSeen.Unix() != want.LastSeen.Unix() {
		t.Fatalf("GetReputation last_seen = %v, want %v", got.LastSeen, want.LastSeen)
	}
}

func TestReputationMissingReturnsNotFound(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.GetReputation(context.Background(), "nope.example"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetReputation missing = %v, want ErrNotFound", err)
	}
}

func TestReputationListOrdering(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	for _, d := range []string{"z.example", "a.example", "m.example"} {
		if err := s.SetReputation(ctx, model.Reputation{Domain: d, Alpha: 1, Beta: 1}); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.ListReputations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Domain != "a.example" || got[1].Domain != "m.example" || got[2].Domain != "z.example" {
		t.Fatalf("ListReputations order = %v, want [a m z]", got)
	}
}

func TestReputationUpsertOverwrite(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	if err := s.SetReputation(ctx, model.Reputation{Domain: "a.example", Alpha: 1, Beta: 1}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetReputation(ctx, model.Reputation{
		Domain: "a.example", Alpha: 7, Beta: 4, Denied: true,
		LastSeen: time.Unix(1700000000, 0).UTC(),
	}); err != nil {
		t.Fatalf("SetReputation overwrite: %v", err)
	}
	got, err := s.GetReputation(ctx, "a.example")
	if err != nil {
		t.Fatal(err)
	}
	if got.Alpha != 7 || got.Beta != 4 || !got.Denied {
		t.Fatalf("GetReputation after overwrite = %+v, want v2", got)
	}
	all, err := s.ListReputations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Fatalf("ListReputations after overwrite has %d rows, want 1", len(all))
	}
}
