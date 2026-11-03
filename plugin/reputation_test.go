// FROZEN — Wave 2 Task 2.2 reputation unit tests. Do not edit without a plan amendment.
package main

import (
	"context"
	"math"
	"path/filepath"
	"testing"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
	"github.com/athmabhiram/context-curator/plugin/store"
)

func approxEq(a, b, tol float64) bool { return math.Abs(a-b) <= tol }

func TestUtilityPriorIsHalf(t *testing.T) {
	if got := Utility(Reputation{Alpha: 1, Beta: 1}); got != 0.5 {
		t.Fatalf("Utility(1,1) = %v, want 0.5", got)
	}
}

func TestUtilityNonPositiveSumIsHalf(t *testing.T) {
	for _, r := range []Reputation{{Alpha: 0, Beta: 0}, {Alpha: -1, Beta: 0}, {Alpha: 0, Beta: -2}} {
		if got := Utility(r); got != 0.5 {
			t.Fatalf("Utility(%+v) = %v, want 0.5", r, got)
		}
	}
}

func TestPositiveMovesPosterior(t *testing.T) {
	before := time.Now().Add(-time.Hour)
	r := Reputation{Domain: "a.example", Alpha: 1, Beta: 1, LastSeen: before}
	up := Apply(r, true)
	if up.Alpha != 2 || up.Beta != 1 {
		t.Fatalf("Apply(+, 1,1) = (%v,%v), want (2,1)", up.Alpha, up.Beta)
	}
	if up.Domain != "a.example" || up.Denied {
		t.Fatalf("Apply(+) must preserve domain and denied flag: %+v", up)
	}
	if !up.LastSeen.After(before) {
		t.Fatalf("Apply(+) must advance LastSeen: %+v", up)
	}
	if got := Utility(up); got != 2.0/3.0 {
		t.Fatalf("Utility after positive = %v, want %v", got, 2.0/3.0)
	}
	down := Apply(r, false)
	if down.Alpha != 1 || down.Beta != 2 {
		t.Fatalf("Apply(-, 1,1) = (%v,%v), want (1,2)", down.Alpha, down.Beta)
	}
	if got := Utility(down); got != 1.0/3.0 {
		t.Fatalf("Utility after negative = %v, want %v", got, 1.0/3.0)
	}
}

func TestApplyCapsAt10000(t *testing.T) {
	r := Reputation{Domain: "a.example", Alpha: 9999.5, Beta: 9999.5, LastSeen: time.Now().Add(-time.Hour)}
	up := Apply(r, true)
	if up.Alpha != 10000 {
		t.Fatalf("Apply(+) alpha = %v, want cap 10000", up.Alpha)
	}
	again := Apply(up, true)
	if again.Alpha != 10000 {
		t.Fatalf("Apply(+) at cap alpha = %v, want 10000", again.Alpha)
	}
	down := Apply(Reputation{Alpha: 10000, Beta: 9999.5}, false)
	if down.Beta != 10000 {
		t.Fatalf("Apply(-) beta = %v, want cap 10000", down.Beta)
	}
	if down.Alpha != 10000 {
		t.Fatalf("Apply(-) must not move alpha: %v", down.Alpha)
	}
}

func TestDecayPullsToPrior(t *testing.T) {
	now := time.Now()
	r := Reputation{Domain: "a.example", Alpha: 5, Beta: 3, LastSeen: now.Add(-24 * time.Hour)}
	d := Decay(r, now)
	wantA := 1 + (5-1)*math.Pow(0.99, 1)
	wantB := 1 + (3-1)*math.Pow(0.99, 1)
	if !approxEq(d.Alpha, wantA, 1e-9) || !approxEq(d.Beta, wantB, 1e-9) {
		t.Fatalf("Decay(1d) = (%v,%v), want (%v,%v)", d.Alpha, d.Beta, wantA, wantB)
	}
	if !d.LastSeen.Equal(now) {
		t.Fatalf("Decay must set LastSeen=now: %+v", d)
	}
	if d.Domain != "a.example" {
		t.Fatalf("Decay must preserve domain: %+v", d)
	}
}

func TestDecayConvergesNearPriorAfter365Days(t *testing.T) {
	now := time.Now()
	r := Reputation{Domain: "a.example", Alpha: 2, Beta: 3, LastSeen: now.Add(-365 * 24 * time.Hour)}
	d := Decay(r, now)
	if !approxEq(d.Alpha, 1, 0.05) || !approxEq(d.Beta, 1, 0.06) {
		t.Fatalf("Decay(365d) = (%v,%v), want near (1,1)", d.Alpha, d.Beta)
	}
}

func openReputationStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "rep.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestDeniedUtilityIsZero(t *testing.T) {
	s := openReputationStore(t)
	ctx := context.Background()
	if err := s.SetReputation(ctx, model.Reputation{
		Domain: "evil.example", Alpha: 9, Beta: 1, LastSeen: time.Now(), Denied: true,
	}); err != nil {
		t.Fatal(err)
	}
	p := &pipeline{cfg: DefaultConfig(), store: s}
	if got := p.utilityFor("evil.example"); got != 0.0 {
		t.Fatalf("utilityFor(denied) = %v, want 0.0", got)
	}
}

func TestNilStoreUtilityIsHalf(t *testing.T) {
	p := &pipeline{cfg: DefaultConfig()}
	if got := p.utilityFor("a.example"); got != 0.5 {
		t.Fatalf("utilityFor(nil store) = %v, want 0.5", got)
	}
}

func TestMissingDomainUtilityIsHalf(t *testing.T) {
	s := openReputationStore(t)
	p := &pipeline{cfg: DefaultConfig(), store: s}
	if got := p.utilityFor("missing.example"); got != 0.5 {
		t.Fatalf("utilityFor(missing) = %v, want 0.5", got)
	}
	cached, ok := p.utilities["missing.example"]
	if !ok || cached != 0.5 {
		t.Fatalf("missing-domain utility must be cached: %v", p.utilities)
	}
}

func TestUtilityForCachesPosterior(t *testing.T) {
	s := openReputationStore(t)
	ctx := context.Background()
	if err := s.SetReputation(ctx, model.Reputation{
		Domain: "a.example", Alpha: 3, Beta: 1, LastSeen: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	p := &pipeline{cfg: DefaultConfig(), store: s}
	if got := p.utilityFor("a.example"); got != 0.75 {
		t.Fatalf("utilityFor = %v, want 0.75", got)
	}
	if cached, ok := p.utilities["a.example"]; !ok || cached != 0.75 {
		t.Fatalf("posterior must be cached: %v", p.utilities)
	}
}
