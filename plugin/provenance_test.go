// FROZEN — DO NOT EDIT. Task 1.3 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"testing"
	"time"
)

func TestKnownFromURL(t *testing.T) {
	got := ExtractProvenance(Chunk{Text: "see https://docs.example.com/pricing"}, time.Now())
	if got.Domain != "docs.example.com" || got.Provenance != ProvenanceKnown {
		t.Fatalf("%+v", got)
	}
}

func TestInferredWithoutURL(t *testing.T) {
	got := ExtractProvenance(Chunk{Text: "no links"}, time.Now())
	if got.Provenance != ProvenanceInferred {
		t.Fatalf("%+v", got)
	}
}

func TestMultiURLDoesNotCollapse(t *testing.T) {
	got := ExtractProvenance(Chunk{Text: "https://a.example.com/x and https://b.example.com/y"}, time.Now())
	if len(got.SourceURLs) != 2 {
		t.Fatalf("urls = %v, want 2 in order", got.SourceURLs)
	}
	if got.SourceURLs[0] != "https://a.example.com/x" || got.SourceURLs[1] != "https://b.example.com/y" {
		t.Fatalf("urls = %v, order not preserved", got.SourceURLs)
	}
}

func TestDomainLowercasedAndPortStripped(t *testing.T) {
	d, err := NormalizeDomain("https://DOCS.Example.COM:8443/pricing?q=1")
	if err != nil || d != "docs.example.com" {
		t.Fatalf("domain = %q, err = %v", d, err)
	}
}

func TestTrailingPunctuationNotPartOfURL(t *testing.T) {
	got := ExtractProvenance(Chunk{Text: "read https://docs.example.com/pricing."}, time.Now())
	if len(got.SourceURLs) != 1 || got.SourceURLs[0] != "https://docs.example.com/pricing" {
		t.Fatalf("urls = %v", got.SourceURLs)
	}
	if got.Domain != "docs.example.com" {
		t.Fatalf("domain = %q", got.Domain)
	}
}

func TestMalformedURLIsInferred(t *testing.T) {
	got := ExtractProvenance(Chunk{Text: "go to https:// for details"}, time.Now())
	if got.Provenance != ProvenanceInferred || len(got.SourceURLs) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestHashStableAcrossWhitespace(t *testing.T) {
	now := time.Now()
	a := ExtractProvenance(Chunk{Text: "price  is   49\n dollars"}, now)
	b := ExtractProvenance(Chunk{Text: "price is 49 dollars"}, now)
	if a.ContentHash == "" || a.ContentHash != b.ContentHash {
		t.Fatalf("hash a=%q b=%q, want equal non-empty", a.ContentHash, b.ContentHash)
	}
	c := ExtractProvenance(Chunk{Text: "price is 50 dollars"}, now)
	if c.ContentHash == a.ContentHash {
		t.Fatal("different text must hash differently")
	}
}

func TestFetchedAtPreservedWhenSet(t *testing.T) {
	fixed := time.Unix(1700000000, 0)
	got := ExtractProvenance(Chunk{Text: "x https://a.example.com", FetchedAt: fixed}, time.Now())
	if !got.FetchedAt.Equal(fixed) {
		t.Fatalf("FetchedAt = %v, want %v", got.FetchedAt, fixed)
	}
}

func TestFetchedAtDefaultsToNow(t *testing.T) {
	before := time.Now()
	got := ExtractProvenance(Chunk{Text: "plain"}, time.Now())
	if got.FetchedAt.Before(before) || got.FetchedAt.After(time.Now()) {
		t.Fatalf("FetchedAt = %v, want ~now", got.FetchedAt)
	}
}

func TestNormalizeDomainRejectsBareHost(t *testing.T) {
	if _, err := NormalizeDomain("not a url at all"); err == nil {
		t.Fatal("expected error for non-URL")
	}
}
