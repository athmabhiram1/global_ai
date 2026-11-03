// FROZEN — DO NOT EDIT. Task 1.1 decision acceptance tests, hardest difficulty.
// Every dropped chunk carries a reason from the fixed list, and the counts
// must reconcile: a silent drop or a double-counted chunk fails the suite.
// Only non-test sources may change; test edits need a plan amendment.
package main

import "testing"

func TestEveryDropNeedsAReason(t *testing.T) {
	d := Decision{ChunksIn: 2, ChunksKept: 1, Dropped: []DropReason{{ID: "c2"}}}
	if d.Validate() == nil {
		t.Fatal("expected error for a drop without a reason")
	}
}

func TestRejectsUnknownReasonCode(t *testing.T) {
	d := Decision{ChunksIn: 1, ChunksKept: 0, Dropped: []DropReason{{ID: "c1", Reason: "vibes"}}}
	if d.Validate() == nil {
		t.Fatal("expected error for a reason outside the fixed list")
	}
}

func TestDuplicateOfNeedsAnID(t *testing.T) {
	d := Decision{ChunksIn: 1, ChunksKept: 0, Dropped: []DropReason{{ID: "c1", Reason: "duplicate_of:"}}}
	if d.Validate() == nil {
		t.Fatal("expected error for duplicate_of without a target id")
	}
}

func TestCountsMustReconcile(t *testing.T) {
	// 2 in, 1 kept, 0 dropped recorded: one chunk vanished silently.
	d := Decision{ChunksIn: 2, ChunksKept: 1}
	if d.Validate() == nil {
		t.Fatal("expected error when kept + dropped != in")
	}
	// Kept exceeds input: double-counted.
	d = Decision{
		ChunksIn: 1, ChunksKept: 2,
		Dropped: []DropReason{{ID: "c1", Reason: ReasonStale}},
	}
	if d.Validate() == nil {
		t.Fatal("expected error when kept exceeds input")
	}
}

func TestKeptAndDroppedMustNotOverlap(t *testing.T) {
	d := Decision{
		ChunksIn: 2, ChunksKept: 1, Kept: []string{"c1"},
		Dropped: []DropReason{{ID: "c1", Reason: ReasonStale}},
	}
	if d.Validate() == nil {
		t.Fatal("expected error when a chunk is both kept and dropped")
	}
}

func TestRejectsDuplicateDropIDs(t *testing.T) {
	d := Decision{
		ChunksIn: 2, ChunksKept: 0,
		Dropped: []DropReason{
			{ID: "c1", Reason: ReasonStale},
			{ID: "c1", Reason: ReasonLowRelevance},
		},
	}
	if d.Validate() == nil {
		t.Fatal("expected error for the same chunk dropped twice")
	}
}

func TestValidDecisionPasses(t *testing.T) {
	d := Decision{
		ChunksIn: 3, ChunksKept: 1, Kept: []string{"c1"},
		Dropped: []DropReason{
			{ID: "c2", Reason: ReasonStale},
			{ID: "c3", Reason: "duplicate_of:c1"},
		},
	}
	if err := d.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want nil", err)
	}
}
