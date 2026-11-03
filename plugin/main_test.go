// FROZEN — DO NOT EDIT. Task 0.2/1.1 acceptance tests, hardest difficulty.
// A failing test blocks its task; only non-test sources may change.
// Test edits require a plan amendment entry with a reason.
package main

import "testing"

func TestGetName(t *testing.T) {
	if got := GetName(); got != "context-curator" {
		t.Fatalf("GetName() = %q, want %q", got, "context-curator")
	}
}

func TestInitNilAppliesDefaults(t *testing.T) {
	// Plan correction (Global Constraints): Init(nil) unmarshals `null` to a
	// zero Config, then defaults + Validate pass — it must succeed, not error.
	if err := Init(nil); err != nil {
		t.Fatalf("Init(nil) = %v, want nil", err)
	}
}
