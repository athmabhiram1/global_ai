// FROZEN — DO NOT EDIT. Task 1.4 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"testing"
	"time"
)

func TestFreshnessDecays(t *testing.T) {
	now := time.Now()
	a := Score(Chunk{FetchedAt: now}, ScoreInput{Now: now, FreshnessClass: "price"})
	b := Score(Chunk{FetchedAt: now.Add(-48 * time.Hour)}, ScoreInput{Now: now, FreshnessClass: "price"})
	if a.Freshness <= b.Freshness {
		t.Fatalf("fresh=%f old=%f, want fresh > old", a.Freshness, b.Freshness)
	}
}

func TestIndependenceInvertsClusterSize(t *testing.T) {
	a := Score(Chunk{ClusterSize: 1}, ScoreInput{Now: time.Now()})
	b := Score(Chunk{ClusterSize: 4}, ScoreInput{Now: time.Now()})
	if a.Independence <= b.Independence {
		t.Fatal("independence must invert cluster size")
	}
}

func TestScoreIsDeterministic(t *testing.T) {
	c := Chunk{ContentHash: "abc", FetchedAt: time.Unix(0, 0)}
	in := ScoreInput{Now: time.Unix(1000, 0)}
	if Score(c, in).Score != Score(c, in).Score {
		t.Fatal("non-deterministic score")
	}
}

func TestWeightsSumToScore(t *testing.T) {
	// Relevance 1, authority reputable 0.8, others forced: freshness of a
	// fresh chunk ~1, independence 1 (size 0->1), utility default 0.5.
	// Score must equal the weighted sum rounded to 6dp.
	now := time.Now()
	got := Score(Chunk{
		Relevance: 1, Authority: AuthorityReputable,
		FetchedAt: now, ClusterSize: 0,
	}, ScoreInput{Now: now, FreshnessClass: "static", Utility: func(string) float64 { return 0.5 }})
	want := 0.35*1 + 0.20*0.8 + 0.20*1 + 0.15*1 + 0.10*0.5
	// freshness of a just-fetched static chunk is exp(0)=1.
	if diff := got.Score - want; diff > 0.000001 || diff < -0.000001 {
		t.Fatalf("score=%f want=%f", got.Score, want)
	}
}

func TestDeniedAuthorityScoresZero(t *testing.T) {
	got := Score(Chunk{Authority: AuthorityDenied}, ScoreInput{Now: time.Now()})
	if got.Score < 0 {
		t.Fatalf("score=%f, want >= 0 even for denied", got.Score)
	}
	if AuthorityWeight(AuthorityDenied) != 0.0 {
		t.Fatalf("denied weight = %f, want 0", AuthorityWeight(AuthorityDenied))
	}
}

func TestAuthorityWeights(t *testing.T) {
	cases := map[AuthorityTier]float64{
		AuthorityPrimary: 1.0, AuthorityReputable: 0.8,
		AuthorityAggregator: 0.5, AuthorityUnknown: 0.3, AuthorityDenied: 0.0,
	}
	for tier, want := range cases {
		if got := AuthorityWeight(tier); got != want {
			t.Fatalf("weight(%q) = %f, want %f", tier, got, want)
		}
	}
}

func TestScoreRoundedToSixDecimals(t *testing.T) {
	got := Score(Chunk{Relevance: 0.123456789}, ScoreInput{Now: time.Now()})
	rounded := float64(int(got.Score*1e6+0.5)) / 1e6
	if got.Score != rounded {
		t.Fatalf("score=%v not rounded to 6dp", got.Score)
	}
}

func TestUtilityDefaultsToHalf(t *testing.T) {
	a := Score(Chunk{}, ScoreInput{Now: time.Now()})
	b := Score(Chunk{}, ScoreInput{Now: time.Now(), Utility: func(string) float64 { return 0.5 }})
	if a.Score != b.Score {
		t.Fatalf("nil utility %f != explicit 0.5 %f", a.Score, b.Score)
	}
}
