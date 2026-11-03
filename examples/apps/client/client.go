// Package client is the shared HTTP caller for the Wave 3 demo apps. One
// request shape, one answer parser, one seed loader — the three apps differ
// only in which question they ask.
package client

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
	"time"
)

// BuildRequest renders an OpenAI-style chat request: the user question first,
// then every seed page as a tool message. The pipeline segments tool
// messages only, so user prose never enters the chunk pool.
func BuildRequest(model, question string, pages []string) map[string]any {
	msgs := make([]map[string]string, 0, len(pages)+1)
	msgs = append(msgs, map[string]string{"role": "user", "content": question})
	for _, p := range pages {
		msgs = append(msgs, map[string]string{"role": "tool", "content": p})
	}
	return map[string]any{
		"model":       model,
		"messages":    msgs,
		"temperature": 0.0,
	}
}

// ParseAnswer extracts the assistant text and total tokens from a chat
// completions body. Content arrives as a string or as a parts array.
func ParseAnswer(body []byte) (string, int, error) {
	var resp struct {
		Choices []struct {
			Message struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", 0, fmt.Errorf("apps: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", 0, fmt.Errorf("apps: empty choices")
	}
	raw := bytes.TrimSpace(resp.Choices[0].Message.Content)
	if len(raw) == 0 {
		return "", 0, fmt.Errorf("apps: empty content")
	}
	if raw[0] == '"' {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return "", 0, fmt.Errorf("apps: %w", err)
		}
		return s, resp.Usage.TotalTokens, nil
	}
	var parts []struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return "", 0, fmt.Errorf("apps: %w", err)
	}
	var b strings.Builder
	for _, p := range parts {
		b.WriteString(p.Text)
	}
	return b.String(), resp.Usage.TotalTokens, nil
}

// LoadPages returns every *.md file in dir, sorted by name, as strings.
func LoadPages(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("apps: %w", err)
	}
	names := []string{}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	pages := make([]string, 0, len(names))
	for _, n := range names {
		raw, err := os.ReadFile(filepath.Join(dir, n))
		if err != nil {
			return nil, fmt.Errorf("apps: %w", err)
		}
		pages = append(pages, string(raw))
	}
	return pages, nil
}

// Ask posts one curated question and returns the assistant answer.
func Ask(baseURL, model, question string, pages []string) (string, error) {
	raw, err := json.Marshal(BuildRequest(model, question, pages))
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(baseURL, "/")+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("BF_VIRTUAL_KEY"); key != "" {
		req.Header.Set("x-bf-vk", key)
	}
	httpClient := &http.Client{Timeout: 60 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", fmt.Errorf("apps: status %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	answer, _, err := ParseAnswer(body)
	return answer, err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
