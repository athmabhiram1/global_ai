package main

import (
	"regexp"
	"sort"
	"time"
)

// This file implements PRD §"required primary source classes" and the
// "classify chunks into price, version, law, static" step: every chunk gets
// a freshness class from its own text, an explicit statement year when the
// text declares one, and — only when fresher evidence of the same class is
// admitted — the stale statement is refused with ReasonStale.
//
// A chunk is never dropped for staleness when it is the sole witness of its
// class: degradation, never a gap. That keeps the gateway honest without
// ever breaking it.

// priceSignal matches money talk: a dollar sign or a whole pricing word.
var priceSignal = regexp.MustCompile(`(?i)\$|\bprices?\b|\bpricing\b|\bseats?\b|\bbill(?:ed|ing)\b|\bsubscription\b`)

// versionSignal matches toolchain talk: version words, a bare "go", a build
// verb, or a dotted release number. Checked only after price, so "$49 per
// seat" can never classify as a version.
var versionSignal = regexp.MustCompile(`(?i)\bversions?\b|\btoolchains?\b|\bgo\b|\bbuilds?\b|\bcompile[sd]?\b|\bv?\d+\.\d+`)

// lawSignal matches regulatory talk.
var lawSignal = regexp.MustCompile(`(?i)\blaws?\b|\blegal\b|\bregulations?\b|\bcompliance\b|\bretention\b`)

// yearPattern matches an explicit four-digit statement year.
var yearPattern = regexp.MustCompile(`\b(19\d{2}|20\d{2})\b`)

// ClassifyChunk assigns a freshness class from chunk text. Precedence is
// price, then version, then law; everything else is static. Deterministic:
// fixed signal order, no maps.
func ClassifyChunk(text string) string {
	switch {
	case priceSignal.MatchString(text):
		return "price"
	case versionSignal.MatchString(text):
		return "version"
	case lawSignal.MatchString(text):
		return "law"
	default:
		return "static"
	}
}

// StatementYear returns the latest explicit four-digit year in the text, or
// 0 when the text declares none. Dotted release numbers ("3.2", "1.24")
// never match: the pattern needs exactly four digits.
func StatementYear(text string) int {
	best := 0
	for _, m := range yearPattern.FindAllString(text, -1) {
		y := 0
		for _, r := range m {
			y = y*10 + int(r-'0')
		}
		if y > best {
			best = y
		}
	}
	return best
}

// StaleByStatement reports whether a chunk's own declared year makes it
// stale for its class. A prior-calendar-year statement is stale only in a
// sub-year class (price 24h, version 720h, law 168h); static content (8760h)
// never goes stale by year, and a current- or future-year statement is
// never stale. Chunks with no declared year are never stale here: their
// FetchedAt (tool arrival) is the only age signal and it is always now.
func StaleByStatement(class string, year int, now time.Time) bool {
	if year == 0 || year > now.Year() {
		return false
	}
	if maxAgeHours(class) >= 8760 {
		return false
	}
	return year < now.Year()
}

// classOrder fixes iteration order so supersession is deterministic.
var classOrder = []string{"price", "version", "law", "static"}

// Supersede partitions chunks by freshness class and refuses stale chunks
// only where at least one fresh chunk of the same class survives. The sole
// witness of a class is always kept. Input order is preserved, so the
// positional rewrite pairing stays deterministic.
func Supersede(chunks []Chunk, now time.Time) ([]Chunk, []DropReason) {
	byClass := map[string][]int{}
	for i, c := range chunks {
		class := c.FreshnessClass
		if class == "" {
			class = "static"
		}
		byClass[class] = append(byClass[class], i)
	}
	ordered := append([]string{}, classOrder...)
	rest := []string{}
	for class := range byClass {
		known := false
		for _, k := range classOrder {
			if k == class {
				known = true
				break
			}
		}
		if !known {
			rest = append(rest, class)
		}
	}
	sort.Strings(rest)
	ordered = append(ordered, rest...)

	drop := map[int]string{}
	for _, class := range ordered {
		idx, ok := byClass[class]
		if !ok {
			continue
		}
		fresh := false
		for _, i := range idx {
			if !StaleByStatement(class, StatementYear(chunks[i].Text), now) {
				fresh = true
				break
			}
		}
		if !fresh {
			continue
		}
		for _, i := range idx {
			if StaleByStatement(class, StatementYear(chunks[i].Text), now) {
				drop[i] = ReasonStale
			}
		}
	}
	kept := make([]Chunk, 0, len(chunks))
	dropped := []DropReason{}
	for i, c := range chunks {
		if reason, ok := drop[i]; ok {
			dropped = append(dropped, DropReason{ID: c.ID, Reason: reason})
			continue
		}
		kept = append(kept, c)
	}
	return kept, dropped
}
