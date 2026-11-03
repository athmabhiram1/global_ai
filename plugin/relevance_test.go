// FROZEN — DO NOT EDIT. Query-relevance acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import "testing"

func TestRelevanceFullOverlap(t *testing.T) {
	if got := Relevance("price per seat", "The price is 49 dollars per seat"); got != 1.0 {
		t.Fatalf("relevance = %f, want 1", got)
	}
}

func TestRelevancePartialOverlap(t *testing.T) {
	got := Relevance("price per seat", "the price changed")
	if got < 0.33 || got > 0.34 {
		t.Fatalf("relevance = %f, want ~1/3", got)
	}
}

func TestRelevanceNoOverlap(t *testing.T) {
	if got := Relevance("price per seat", "refunds within thirty days"); got != 0.0 {
		t.Fatalf("relevance = %f, want 0", got)
	}
}

func TestRelevanceEmptyQueryIsZero(t *testing.T) {
	if got := Relevance("", "some text here"); got != 0.0 {
		t.Fatalf("relevance = %f, want 0 (no division by zero)", got)
	}
}

func TestRelevanceIgnoresCaseAndPunctuation(t *testing.T) {
	if got := Relevance("Price!", "price"); got != 1.0 {
		t.Fatalf("relevance = %f, want 1", got)
	}
}

func TestRelevanceIgnoresSingleLetters(t *testing.T) {
	if got := Relevance("a price", "price is five"); got != 1.0 {
		t.Fatalf("relevance = %f, want 1 (only price counts)", got)
	}
}
