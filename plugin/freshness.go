package main

import (
	"context"
	"time"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// maxAgeHours maps a freshness class to its stale threshold. Unknown classes
// degrade like law: slowly, never fresh.
func maxAgeHours(class string) int {
	switch class {
	case "price":
		return 24
	case "version":
		return 720
	case "law":
		return 168
	case "static":
		return 8760
	default:
		return 168
	}
}

// CreditBudget caps Tavily spend per request. One refreshed chunk costs one
// credit unit; when the budget is exhausted the remaining chunks are left
// untouched (degrade-to-annotate for the rest).
type CreditBudget struct {
	max   int
	spent int
}

// NewCreditBudget returns a budget allowing at most max refreshes.
func NewCreditBudget(max int) *CreditBudget { return &CreditBudget{max: max} }

// Spent reports how many credit units have been taken.
func (b *CreditBudget) Spent() int { return b.spent }

// Take reserves n units, reporting false without spending when over budget.
func (b *CreditBudget) Take(n int) bool {
	if b.spent+n > b.max {
		return false
	}
	b.spent += n
	return true
}

// Refresh replaces stale chunks that carry a source URL with freshly
// extracted content, within budget. Transport failure marks RefreshFailed
// and keeps the chunk — degradation, never a drop. Stale chunks with no URL
// cannot be refreshed and are dropped as stale so the decision stays honest.
func Refresh(ctx context.Context, chunks []Chunk, _ Policy, r retriever.Retriever, b *CreditBudget) ([]Chunk, []DropReason) {
	kept := make([]Chunk, 0, len(chunks))
	dropped := []DropReason{}
	for _, c := range chunks {
		if !isStale(c, time.Now()) {
			kept = append(kept, c)
			continue
		}
		if len(c.SourceURLs) == 0 {
			dropped = append(dropped, DropReason{ID: c.ID, Reason: ReasonStale})
			continue
		}
		if r == nil || !b.Take(1) {
			kept = append(kept, c)
			continue
		}
		kept = append(kept, refreshOne(ctx, c, r))
	}
	return kept, dropped
}

func isStale(c Chunk, now time.Time) bool {
	if c.FetchedAt.IsZero() {
		return false
	}
	// Staleness is evaluated at one-second resolution so a chunk fetched
	// exactly maxAge ago is not stale; without this, clock progression
	// between stamping FetchedAt and evaluation flips the boundary.
	age := now.Truncate(time.Second).Sub(c.FetchedAt.Truncate(time.Second))
	return age.Hours() > float64(maxAgeHours(c.FreshnessClass))
}

func refreshOne(ctx context.Context, c Chunk, r retriever.Retriever) Chunk {
	hits, err := r.Search(ctx, retriever.Query{Text: c.Text, MaxAgeHours: maxAgeHours(c.FreshnessClass)})
	if err != nil || len(hits) == 0 {
		c.RefreshFailed = true
		return c
	}
	top := hits[0].URL
	if top == "" {
		top = c.SourceURLs[0]
	}
	extracted, err := r.Extract(ctx, []string{top}, c.Text)
	if err != nil || len(extracted) == 0 {
		c.RefreshFailed = true
		return c
	}
	content := extracted[0].RawContent
	if content == "" {
		content = extracted[0].Content
	}
	if content == "" {
		c.RefreshFailed = true
		return c
	}
	c.Text = content
	c.SourceURLs = []string{top}
	c.ContentHash = hashText(content)
	c.FetchedAt = time.Now()
	c.Refreshed = true
	return c
}
