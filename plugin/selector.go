package main

import "sort"

// Select chooses chunks under a token budget with a diversity floor. Greedy
// MMR walks candidates in score order, penalising redundancy against the
// already-kept set; anything that no longer fits is dropped as over_budget.
// Afterwards, clusters missing from the kept set are force-added (highest
// score first) until minSources is met — the floor wins over the budget.
// Ties break on content hash, so selection is deterministic.
func Select(chunks []Chunk, budget, minSources int, lambda float64) ([]Chunk, []DropReason) {
	if len(chunks) == 0 {
		return nil, nil
	}
	candidates := append([]Chunk(nil), chunks...)
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Score != candidates[j].Score {
			return candidates[i].Score > candidates[j].Score
		}
		return candidates[i].ContentHash < candidates[j].ContentHash
	})
	kept := []Chunk{}
	used := 0
	dropped := []DropReason{}
	// Copy: removals below shift the backing array, and enforceMinSources
	// still needs the intact candidate list afterwards.
	remaining := append([]Chunk(nil), candidates...)
	for len(remaining) > 0 {
		best := 0
		bestValue := mmrValue(remaining[0], kept, lambda)
		for i := 1; i < len(remaining); i++ {
			v := mmrValue(remaining[i], kept, lambda)
			if v > bestValue || (v == bestValue && remaining[i].ContentHash < remaining[best].ContentHash) {
				best, bestValue = i, v
			}
		}
		pick := remaining[best]
		remaining = append(remaining[:best], remaining[best+1:]...)
		if used+pick.Tokens <= budget {
			kept = append(kept, pick)
			used += pick.Tokens
		} else {
			dropped = append(dropped, DropReason{ID: pick.ID, Reason: ReasonOverBudget})
		}
	}
	kept = enforceMinSources(kept, &dropped, candidates, minSources)
	sort.SliceStable(kept, func(i, j int) bool { return kept[i].ID < kept[j].ID })
	return kept, dropped
}

func mmrValue(c Chunk, kept []Chunk, lambda float64) float64 {
	redundancy := 0.0
	for _, k := range kept {
		if s := Jaccard(c.Text, k.Text); s > redundancy {
			redundancy = s
		}
	}
	return lambda*c.Score - (1-lambda)*redundancy
}

// enforceMinSources force-adds the best chunk of each missing cluster,
// removing its over_budget drop if one was recorded.
func enforceMinSources(kept []Chunk, dropped *[]DropReason, candidates []Chunk, minSources int) []Chunk {
	if minSources <= 1 && len(kept) > 0 {
		return kept
	}
	present := map[string]bool{}
	for _, k := range kept {
		present[k.ClusterID] = true
	}
	clusterBest := map[string]Chunk{}
	clusterOrder := []string{}
	for _, c := range candidates {
		if present[c.ClusterID] {
			continue
		}
		if _, ok := clusterBest[c.ClusterID]; !ok {
			clusterOrder = append(clusterOrder, c.ClusterID)
			clusterBest[c.ClusterID] = c
		} else if c.Score > clusterBest[c.ClusterID].Score {
			clusterBest[c.ClusterID] = c
		}
	}
	for _, id := range clusterOrder {
		if len(present) >= minSources {
			break
		}
		add := clusterBest[id]
		kept = append(kept, add)
		present[id] = true
		undrop(dropped, add.ID)
	}
	return kept
}

func undrop(dropped *[]DropReason, id string) {
	kept := (*dropped)[:0]
	for _, d := range *dropped {
		if d.ID != id {
			kept = append(kept, d)
		}
	}
	// Nil out the tail so dropped reasons cannot leak via the backing array.
	for i := len(kept); i < len(*dropped); i++ {
		(*dropped)[i] = DropReason{}
	}
	*dropped = kept
}
