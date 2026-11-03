// Command eval is the Wave 3.2 before/after harness.
//
// Every question in questions.jsonl runs twice: once against a curator stack
// in annotate mode (observe only, request passes through untouched — the
// "before") and once against a curator stack in rewrite mode (the "after").
// Each condition repeats N times; the row reports mean accuracy (1 when the
// answer contains every must_contain token and none of the must_not_contain
// tokens, else 0), mean provider tokens, and mean latency.
//
// Usage (from the repo root, stacks already up):
//
//	go run ./examples/eval > examples/eval/results.md
//
// Stacks:
//
//	./examples/run-stack.ps1 -Mode rewrite -Container cc-wave3            # :18080 curated
//	./examples/run-stack.ps1 -Mode annotate -Container cc-eval-raw `
//	    -BifrostPort 18081 -SidecarPort 18091                              # :18081 raw
//
// Environment: EVAL_RAW_URL, EVAL_CURATED_URL, SEED_DIR, MODEL.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// Question is one scored eval item.
type Question struct {
	ID             string   `json:"id"`
	Text           string   `json:"question"`
	MustContain    []string `json:"must_contain"`
	MustNotContain []string `json:"must_not_contain"`
}

// Row is the measured before/after for one question.
type Row struct {
	ID               string
	Question         string
	AccuracyRaw      float64
	AccuracyCurated  float64
	TokensRaw        float64
	TokensCurated    float64
	LatencyRawMs     float64
	LatencyCuratedMs float64
}

// score returns 1 when the answer contains every required token and none of
// the forbidden tokens, else 0. Binary on purpose: a curated answer that
// still carries one stale price is wrong, not half right.
func score(answer string, q Question) float64 {
	for _, want := range q.MustContain {
		if !strings.Contains(answer, want) {
			return 0
		}
	}
	for _, ban := range q.MustNotContain {
		if strings.Contains(answer, ban) {
			return 0
		}
	}
	return 1
}

// loadPages returns every *.md file in dir, sorted by name.
func loadPages(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("eval: %w", err)
	}
	names := []string{}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		return nil, fmt.Errorf("eval: no seed pages in %s", dir)
	}
	pages := make([]string, 0, len(names))
	for _, n := range names {
		raw, err := os.ReadFile(filepath.Join(dir, n))
		if err != nil {
			return nil, fmt.Errorf("eval: %w", err)
		}
		pages = append(pages, string(raw))
	}
	return pages, nil
}

// loadQuestions parses one JSON object per line; blank lines are ignored.
func loadQuestions(path string) ([]Question, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("eval: %w", err)
	}
	questions := []Question{}
	for i, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var q Question
		if err := json.Unmarshal([]byte(line), &q); err != nil {
			return nil, fmt.Errorf("eval: line %d: %w", i+1, err)
		}
		if q.ID == "" || q.Text == "" {
			return nil, fmt.Errorf("eval: line %d: missing id or question", i+1)
		}
		questions = append(questions, q)
	}
	if len(questions) == 0 {
		return nil, fmt.Errorf("eval: no questions in %s", path)
	}
	return questions, nil
}

// askResult is one measured request.
type askResult struct {
	answer    string
	tokens    int
	latencyMs float64
}

// ask posts one curated question and measures the answer, tokens, latency.
func ask(baseURL, model, question string, pages []string) (askResult, error) {
	msgs := make([]map[string]string, 0, len(pages)+1)
	msgs = append(msgs, map[string]string{"role": "user", "content": question})
	for _, p := range pages {
		msgs = append(msgs, map[string]string{"role": "tool", "content": p})
	}
	body, err := json.Marshal(map[string]any{
		"model":       model,
		"messages":    msgs,
		"temperature": 0.0,
	})
	if err != nil {
		return askResult{}, err
	}
	start := time.Now()
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return askResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("BF_VIRTUAL_KEY"); key != "" {
		req.Header.Set("x-bf-vk", key)
	}
	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if err != nil {
		return askResult{}, fmt.Errorf("eval: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return askResult{}, fmt.Errorf("eval: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return askResult{}, fmt.Errorf("eval: status %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return askResult{}, fmt.Errorf("eval: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return askResult{}, fmt.Errorf("eval: empty choices")
	}
	var answer string
	if err := json.Unmarshal(parsed.Choices[0].Message.Content, &answer); err != nil {
		return askResult{}, fmt.Errorf("eval: %w", err)
	}
	return askResult{
		answer:    answer,
		tokens:    parsed.Usage.TotalTokens,
		latencyMs: float64(time.Since(start).Milliseconds()),
	}, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// evaluate runs every question against both stacks, repeats times each, and
// returns one row per question with per-condition means.
func evaluate(rawURL, curatedURL, seedDir, model, questionsPath string, repeats int) ([]Row, error) {
	if repeats < 1 {
		return nil, fmt.Errorf("eval: repeats must be >= 1, got %d", repeats)
	}
	questions, err := loadQuestions(questionsPath)
	if err != nil {
		return nil, err
	}
	pages, err := loadPages(seedDir)
	if err != nil {
		return nil, err
	}
	rows := make([]Row, 0, len(questions))
	for _, q := range questions {
		var accRaw, accCur, tokRaw, tokCur, latRaw, latCur float64
		for i := 0; i < repeats; i++ {
			r, err := ask(rawURL, model, q.Text, pages)
			if err != nil {
				return nil, fmt.Errorf("eval: %s raw attempt %d: %w", q.ID, i+1, err)
			}
			accRaw += score(r.answer, q)
			tokRaw += float64(r.tokens)
			latRaw += r.latencyMs
			c, err := ask(curatedURL, model, q.Text, pages)
			if err != nil {
				return nil, fmt.Errorf("eval: %s curated attempt %d: %w", q.ID, i+1, err)
			}
			accCur += score(c.answer, q)
			tokCur += float64(c.tokens)
			latCur += c.latencyMs
		}
		n := float64(repeats)
		rows = append(rows, Row{
			ID:               q.ID,
			Question:         q.Text,
			AccuracyRaw:      accRaw / n,
			AccuracyCurated:  accCur / n,
			TokensRaw:        tokRaw / n,
			TokensCurated:    tokCur / n,
			LatencyRawMs:     latRaw / n,
			LatencyCuratedMs: latCur / n,
		})
	}
	return rows, nil
}

// runEval is the test entry point: URLs and seed dir come from the
// environment so the frozen test needs no arguments beyond path and repeats.
func runEval(t *testing.T, path string, repeats int) []Row {
	t.Helper()
	rawURL := os.Getenv("EVAL_RAW_URL")
	if rawURL == "" {
		rawURL = "http://localhost:18081"
	}
	curatedURL := os.Getenv("EVAL_CURATED_URL")
	if curatedURL == "" {
		curatedURL = "http://localhost:18080"
	}
	seedDir := os.Getenv("SEED_DIR")
	if seedDir == "" {
		seedDir = "../seed/pages"
	}
	model := os.Getenv("MODEL")
	if model == "" {
		model = "mock/mock-model"
	}
	rows, err := evaluate(rawURL, curatedURL, seedDir, model, path, repeats)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

// printMarkdown renders rows plus the summary table to stdout, so
// `go run ./examples/eval > examples/eval/results.md` captures the report.
func printMarkdown(rows []Row, repeats int) {
	var accRaw, accCur, tokRaw, tokCur, latRaw, latCur float64
	for _, r := range rows {
		accRaw += r.AccuracyRaw
		accCur += r.AccuracyCurated
		tokRaw += r.TokensRaw
		tokCur += r.TokensCurated
		latRaw += r.LatencyRawMs
		latCur += r.LatencyCuratedMs
	}
	n := float64(len(rows))
	accRaw, accCur = accRaw/n, accCur/n
	tokRaw, tokCur = tokRaw/n, tokCur/n
	latRaw, latCur = latRaw/n, latCur/n
	savings := 0.0
	if tokRaw > 0 {
		savings = 100 * (tokRaw - tokCur) / tokRaw
	}

	fmt.Println("# Context Curator eval — before/after")
	fmt.Println()
	fmt.Printf("Raw = plugin in annotate mode (observe only, request passes through). Curated = plugin in rewrite mode. Each cell is the mean of %d repeats against the deterministic mock provider; accuracy is 1 when the echoed answer contains every must_contain token and none of the must_not_contain tokens, else 0.\n", repeats)
	fmt.Println()
	fmt.Println("| id | question | raw acc | curated acc | raw tok | curated tok | raw ms | curated ms |")
	fmt.Println("|----|----------|---------|-------------|---------|-------------|--------|------------|")
	for _, r := range rows {
		fmt.Printf("| %s | %s | %.2f | %.2f | %.0f | %.0f | %.0f | %.0f |\n",
			r.ID, r.Question, r.AccuracyRaw, r.AccuracyCurated,
			r.TokensRaw, r.TokensCurated, r.LatencyRawMs, r.LatencyCuratedMs)
	}
	fmt.Println()
	fmt.Println("## Summary")
	fmt.Println()
	fmt.Printf("- questions: %d, repeats per condition: %d\n", len(rows), repeats)
	fmt.Printf("- mean accuracy raw: %.3f, curated: %.3f (delta %+.3f)\n", accRaw, accCur, accCur-accRaw)
	fmt.Printf("- mean provider tokens raw: %.0f, curated: %.0f (savings %.1f%%)\n", tokRaw, tokCur, savings)
	fmt.Printf("- mean latency raw: %.0f ms, curated: %.0f ms\n", latRaw, latCur)
	fmt.Println("- provider is the deterministic echo mock, so token/latency deltas measure curation only; no model judgement is involved.")
}

func main() {
	rawURL := os.Getenv("EVAL_RAW_URL")
	if rawURL == "" {
		rawURL = "http://localhost:18081"
	}
	curatedURL := os.Getenv("EVAL_CURATED_URL")
	if curatedURL == "" {
		curatedURL = "http://localhost:18080"
	}
	seedDir := os.Getenv("SEED_DIR")
	if seedDir == "" {
		seedDir = "examples/seed/pages"
	}
	model := os.Getenv("MODEL")
	if model == "" {
		model = "mock/mock-model"
	}
	questionsPath := os.Getenv("EVAL_QUESTIONS")
	if questionsPath == "" {
		questionsPath = "examples/eval/questions.jsonl"
	}
	rows, err := evaluate(rawURL, curatedURL, seedDir, model, questionsPath, 3)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	printMarkdown(rows, 3)
}
