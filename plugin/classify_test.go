package main

import (
	"testing"
	"time"
)

// Unit tests for classification and stale-supersession. These cover new
// production code; the frozen acceptance suites pin the pipeline contract.

func TestClassifySeedShapes(t *testing.T) {
	cases := []struct{ text, want string }{
		{"Pro is $49 per seat per month, billed annually.", "price"},
		{"Pro launched at $39 per seat back in 2022.", "price"},
		{"Acme launches Pro at $49 per seat per month.", "price"},
		{"Unbeatable deals today only, act now before prices explode.", "price"},
		{"Version 3.2 requires Go 1.24 or later to build.", "version"},
		{"The 2024 retention law requires 7-year data retention.", "law"},
		{"The sky is blue and water is wet.", "static"},
	}
	for _, c := range cases {
		if got := ClassifyChunk(c.text); got != c.want {
			t.Errorf("ClassifyChunk(%q) = %q, want %q", c.text, got, c.want)
		}
	}
}

func TestStatementYear(t *testing.T) {
	if got := StatementYear("back in 2022. Prices have changed"); got != 2022 {
		t.Errorf("year = %d, want 2022", got)
	}
	if got := StatementYear("Version 3.2 requires Go 1.24"); got != 0 {
		t.Errorf("year = %d, want 0 (release numbers are not years)", got)
	}
	if got := StatementYear("no dates here"); got != 0 {
		t.Errorf("year = %d, want 0", got)
	}
}

func TestStaleByStatement(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	if !StaleByStatement("price", 2022, now) {
		t.Error("2022 price statement should be stale")
	}
	if !StaleByStatement("law", 2024, now) {
		t.Error("2024 law statement should be a stale candidate")
	}
	if StaleByStatement("static", 2020, now) {
		t.Error("static content never goes stale by year")
	}
	if StaleByStatement("price", 0, now) {
		t.Error("undeclared year is never stale here")
	}
	if StaleByStatement("price", 2026, now) {
		t.Error("current-year statement is never stale")
	}
	if StaleByStatement("price", 2027, now) {
		t.Error("future year is never stale")
	}
}

func TestSupersedeDropsStaleWhenFreshPresent(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	live := []Chunk{
		{ID: "c0", Text: "Pro is $49 per seat.", FreshnessClass: "price"},
		{ID: "c1", Text: "Pro launched at $39 back in 2022.", FreshnessClass: "price"},
	}
	kept, dropped := Supersede(live, now)
	if len(kept) != 1 || kept[0].ID != "c0" {
		t.Fatalf("kept = %+v, want only c0", kept)
	}
	if len(dropped) != 1 || dropped[0].ID != "c1" || dropped[0].Reason != ReasonStale {
		t.Fatalf("dropped = %+v, want c1 stale", dropped)
	}
}

func TestSupersedeKeepsSoleWitness(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	live := []Chunk{
		{ID: "c0", Text: "The 2024 retention law requires 7-year retention.", FreshnessClass: "law"},
	}
	kept, dropped := Supersede(live, now)
	if len(kept) != 1 || len(dropped) != 0 {
		t.Fatalf("kept = %+v dropped = %+v, want sole witness kept", kept, dropped)
	}
}

func TestSupersedeKeepsAllFresh(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	live := []Chunk{
		{ID: "c0", Text: "Pro is $49 per seat.", FreshnessClass: "price"},
		{ID: "c1", Text: "Version 3.2 requires Go 1.24.", FreshnessClass: "version"},
	}
	kept, dropped := Supersede(live, now)
	if len(kept) != 2 || len(dropped) != 0 {
		t.Fatalf("kept = %+v dropped = %+v, want everything kept", kept, dropped)
	}
}

func TestHandleSupersedesStalePriceEndToEnd(t *testing.T) {
	req := toolRequest(
		"Pro is $49 per seat per month, billed annually. Source: https://docs.example.com/pricing",
		"Pro launched at $39 per seat per month back in 2022. Prices have changed since then. Source: https://blog.example.com/pricing-2022",
	)
	p := &pipeline{cfg: DefaultConfig()}
	d, err := p.handle(nil, req)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.Validate(); err != nil {
		t.Fatalf("decision invalid: %v", err)
	}
	stale := false
	for _, drop := range d.Dropped {
		if drop.Reason == ReasonStale {
			stale = true
		}
	}
	if !stale {
		t.Fatalf("decision = %+v, want a stale drop", d)
	}
}
