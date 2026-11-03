package main

import "strings"

// shingleSize is the character n-gram width for near-duplicate detection.
const shingleSize = 3

// shingles returns the set of character 3-shingles of s, lowercased with
// runs of whitespace collapsed. Short texts yield their whole normalised
// form as one shingle. Character shingles catch the reworded near-dupes
// ("per seat per month" vs "per seat each month") that word shingles miss.
func shingles(s string) map[string]bool {
	normalised := strings.Join(strings.Fields(strings.ToLower(s)), " ")
	runes := []rune(normalised)
	set := map[string]bool{}
	if len(runes) < shingleSize {
		set[normalised] = true
		return set
	}
	for i := 0; i+shingleSize <= len(runes); i++ {
		set[string(runes[i:i+shingleSize])] = true
	}
	return set
}

// Jaccard returns the 3-shingle Jaccard similarity of a and b in [0,1].
// Identical texts score 1, disjoint texts score 0.
func Jaccard(a, b string) float64 {
	sa, sb := shingles(a), shingles(b)
	if len(sa) == 0 && len(sb) == 0 {
		return 1.0
	}
	inter := 0
	for s := range sa {
		if sb[s] {
			inter++
		}
	}
	union := len(sa) + len(sb) - inter
	if union == 0 {
		return 1.0
	}
	return float64(inter) / float64(union)
}

// Cluster collapses near-duplicate chunks. Union-find joins pairs at or above
// threshold; each cluster keeps one representative — highest authority, then
// highest freshness, then lowest content hash — in first-seen order, stamped
// with the cluster size. Representatives carry ClusterID = their own ID.
func Cluster(chunks []Chunk, threshold float64) []Chunk {
	n := len(chunks)
	if n == 0 {
		return nil
	}
	sets := clusterSets(chunks, threshold)
	reps := make([]Chunk, 0, len(sets))
	for _, members := range sets {
		best := members[0]
		for _, i := range members[1:] {
			if betterRepresentative(chunks[i], chunks[best]) {
				best = i
			}
		}
		rep := chunks[best]
		rep.ClusterID = rep.ID
		rep.ClusterSize = len(members)
		reps = append(reps, rep)
	}
	return reps
}

// clusterSets groups chunk indexes into near-duplicate sets in first-seen
// order. Shared with the pipeline so duplicate_of drops name the same
// representatives Cluster returns.
func clusterSets(chunks []Chunk, threshold float64) [][]int {
	n := len(chunks)
	parent := make([]int, n)
	for i := range parent {
		parent[i] = i
	}
	var find func(int) int
	find = func(x int) int {
		for parent[x] != x {
			parent[x] = parent[parent[x]]
			x = parent[x]
		}
		return x
	}
	union := func(a, b int) {
		ra, rb := find(a), find(b)
		if ra == rb {
			return
		}
		if ra < rb {
			parent[rb] = ra
		} else {
			parent[ra] = rb
		}
	}
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if Jaccard(chunks[i].Text, chunks[j].Text) >= threshold {
				union(i, j)
			}
		}
	}
	order := []int{}
	members := map[int][]int{}
	for i := range chunks {
		r := find(i)
		if _, ok := members[r]; !ok {
			order = append(order, r)
		}
		members[r] = append(members[r], i)
	}
	sets := make([][]int, 0, len(order))
	for _, r := range order {
		sets = append(sets, members[r])
	}
	return sets
}

func betterRepresentative(a, b Chunk) bool {
	if AuthorityWeight(a.Authority) != AuthorityWeight(b.Authority) {
		return AuthorityWeight(a.Authority) > AuthorityWeight(b.Authority)
	}
	if a.Freshness != b.Freshness {
		return a.Freshness > b.Freshness
	}
	return a.ContentHash < b.ContentHash
}
