// FROZEN — DO NOT EDIT. Task 1.1 acceptance tests, hardest difficulty.
// A failing test blocks its task; only non-test sources may change.
// Test edits require a plan amendment entry with a reason.
package main

import "testing"

func TestDefaults(t *testing.T) {
	c, err := ParseConfig(map[string]any{"enabled": true})
	if err != nil {
		t.Fatal(err)
	}
	if c.Mode != ModeAnnotate {
		t.Fatalf("mode = %q, want annotate", c.Mode)
	}
	if c.Budget.MaxContextTokens != 4000 {
		t.Fatalf("budget = %d, want 4000", c.Budget.MaxContextTokens)
	}
}

func TestRejectsUnknownMode(t *testing.T) {
	c := DefaultConfig()
	c.Mode = "destroy"
	if c.Validate() == nil {
		t.Fatal("expected error for unknown mode")
	}
}

func TestRejectsZeroBudget(t *testing.T) {
	c := DefaultConfig()
	c.Budget.MaxContextTokens = 0
	if c.Validate() == nil {
		t.Fatal("expected error for zero max_context_tokens")
	}
}

func TestRejectsBadDuplicateThreshold(t *testing.T) {
	c := DefaultConfig()
	c.Independence.NearDuplicateThreshold = 1.5
	if c.Validate() == nil {
		t.Fatal("expected error for threshold outside (0,1]")
	}
	c = DefaultConfig()
	c.Independence.NearDuplicateThreshold = 0
	if c.Validate() == nil {
		t.Fatal("expected error for zero threshold")
	}
}

func TestRejectsUnknownFreshnessClassRequirement(t *testing.T) {
	c := DefaultConfig()
	c.Authority.RequirePrimaryFor = []string{"gossip"}
	if c.Validate() == nil {
		t.Fatal("expected error for unknown freshness class in require_primary_for")
	}
}
