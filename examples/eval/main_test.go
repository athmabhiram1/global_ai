// FROZEN — DO NOT EDIT. Wave 3.2 eval acceptance test.
// Only non-test sources may change; test edits need a plan amendment.
package main

import "testing"

func TestEvalProducesRows(t *testing.T) {
	rows := runEval(t, "questions.jsonl", 3)
	if len(rows) != 50 {
		t.Fatalf("rows = %d, want 50", len(rows))
	}
	if rows[0].AccuracyRaw == 0 && rows[0].AccuracyCurated == 0 {
		t.Fatal("no measurements")
	}
}
