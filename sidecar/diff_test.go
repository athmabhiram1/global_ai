// FROZEN — Wave 2 Task 2.5 acceptance tests. Do not edit without a plan
// amendment: failing tests mean the diff is wrong, never the tests.
package main

import (
	"testing"
)

func TestDiffFindsChange(t *testing.T) {
	d := SentenceDiff("The price is ten dollars. It rains today.", "The price is twelve dollars. It rains today.")
	if len(d.Changed) != 1 {
		t.Fatalf("Changed = %v, want 1 entry", d.Changed)
	}
	if got := Influence(d); got != 0.5 {
		t.Fatalf("Influence = %v, want 0.5", got)
	}
}

func TestIdenticalIsZero(t *testing.T) {
	d := SentenceDiff("Same sentence here. And another one.", "Same sentence here. And another one.")
	if len(d.Changed) != 0 || len(d.Added) != 0 || len(d.Removed) != 0 {
		t.Fatalf("identical texts must align clean: %+v", d)
	}
	if got := Influence(d); got != 0 {
		t.Fatalf("Influence = %v, want 0", got)
	}
}

func TestDiffPureAddition(t *testing.T) {
	d := SentenceDiff("First sentence.", "First sentence. Second sentence.")
	if len(d.Changed) != 0 {
		t.Fatalf("Changed = %v, want none", d.Changed)
	}
	if len(d.Added) != 1 {
		t.Fatalf("Added = %v, want 1 entry", d.Added)
	}
	if len(d.Removed) != 0 {
		t.Fatalf("Removed = %v, want none", d.Removed)
	}
	if got := Influence(d); got != 0 {
		t.Fatalf("Influence = %v, want 0 (no changed sentences)", got)
	}
}

func TestDiffPureRemoval(t *testing.T) {
	d := SentenceDiff("First sentence. Second sentence.", "First sentence.")
	if len(d.Changed) != 0 {
		t.Fatalf("Changed = %v, want none", d.Changed)
	}
	if len(d.Added) != 0 {
		t.Fatalf("Added = %v, want none", d.Added)
	}
	if len(d.Removed) != 1 {
		t.Fatalf("Removed = %v, want 1 entry", d.Removed)
	}
	if got := Influence(d); got != 0 {
		t.Fatalf("Influence = %v, want 0 (no changed sentences)", got)
	}
}

func TestDiffEmptyInputs(t *testing.T) {
	d := SentenceDiff("", "")
	if d.Total != 0 {
		t.Fatalf("Total = %d, want 0", d.Total)
	}
	if got := Influence(d); got != 0 {
		t.Fatalf("Influence = %v, want 0 for empty inputs", got)
	}
	one := SentenceDiff("", "Only sentence.")
	if one.Total != 1 || len(one.Added) != 1 {
		t.Fatalf("one-sided diff = %+v, want Total 1 with 1 addition", one)
	}
}
