// Wave 2 Task 2.5: sentence alignment for autopsy influence scoring.
//
// SentenceDiff splits two answers on [.?!], aligns the sentences with an LCS
// over case-normalized text, and reports what changed. Influence is the share
// of aligned slots that changed: changed/total, 0 when there is nothing to
// compare.
package main

import (
	"strings"
)

// splitDiffSentences cuts text on sentence-ending punctuation, trims each
// piece, and drops empties. It returns the display forms alongside the
// lower-cased alignment keys.
func splitDiffSentences(text string) (raw []string, norm []string) {
	for _, part := range strings.FieldsFunc(text, func(r rune) bool {
		return r == '.' || r == '?' || r == '!'
	}) {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		raw = append(raw, trimmed)
		norm = append(norm, strings.ToLower(trimmed))
	}
	return raw, norm
}

// lcsAlignPairs returns the index pairs of one longest common subsequence of
// a and b, in order. Short answers make the O(n*m) table affordable.
func lcsAlignPairs(a, b []string) [][2]int {
	n, m := len(a), len(b)
	lengths := make([][]int, n+1)
	for i := range lengths {
		lengths[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				lengths[i][j] = lengths[i+1][j+1] + 1
			} else if lengths[i+1][j] >= lengths[i][j+1] {
				lengths[i][j] = lengths[i+1][j]
			} else {
				lengths[i][j] = lengths[i][j+1]
			}
		}
	}
	var pairs [][2]int
	for i, j := 0, 0; i < n && j < m; {
		if a[i] == b[j] {
			pairs = append(pairs, [2]int{i, j})
			i++
			j++
		} else if lengths[i+1][j] >= lengths[i][j+1] {
			i++
		} else {
			j++
		}
	}
	return pairs
}

// SentenceDiff aligns answer a against answer b. Unaligned sentences between
// two anchors pair positionally into Changed ("old -> new"); leftovers become
// Added (only in b) or Removed (only in a). Total counts every aligned slot:
// anchors + changed + added + removed.
func SentenceDiff(a, b string) Diff {
	rawA, normA := splitDiffSentences(a)
	rawB, normB := splitDiffSentences(b)
	d := Diff{Changed: []string{}, Added: []string{}, Removed: []string{}}

	anchors := append(lcsAlignPairs(normA, normB), [2]int{len(rawA), len(rawB)})
	prevA, prevB := 0, 0
	aligned := 0
	for _, anchor := range anchors {
		gapA, gapB := rawA[prevA:anchor[0]], rawB[prevB:anchor[1]]
		paired := min(len(gapA), len(gapB))
		for k := range paired {
			d.Changed = append(d.Changed, gapA[k]+" -> "+gapB[k])
		}
		d.Removed = append(d.Removed, gapA[paired:]...)
		d.Added = append(d.Added, gapB[paired:]...)
		if anchor[0] < len(rawA) {
			aligned++
		}
		prevA, prevB = anchor[0]+1, anchor[1]+1
	}
	d.Total = aligned + len(d.Changed) + len(d.Added) + len(d.Removed)
	return d
}

// Influence is the share of aligned slots that changed. Empty comparisons
// score 0: no sentences means nothing was influenced.
func Influence(d Diff) float64 {
	if d.Total == 0 {
		return 0
	}
	return float64(len(d.Changed)) / float64(d.Total)
}
