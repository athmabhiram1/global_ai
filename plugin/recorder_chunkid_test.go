package main

import (
	"encoding/json"
	"testing"
)

// Task 3: recorded tool messages carry chunk_id, positional for kept.
func TestRecordedRequestTagsKeptChunkIds(t *testing.T) {
	req := toolRequest("alpha text", "beta text")
	raw := recordedRequest(req, []string{"c0", "c1"})
	var decoded struct {
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
			ChunkID string `json:"chunk_id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatalf("recordedRequest invalid JSON: %v", err)
	}
	// Input: [user, tool, tool]; Rewrite pairs kept[k] with k-th tool msg.
	if len(decoded.Messages) != 3 {
		t.Fatalf("messages = %d, want 3", len(decoded.Messages))
	}
	if got := decoded.Messages[1].ChunkID; got != "c0" {
		t.Fatalf("tool msg 0 chunk_id = %q, want %q", got, "c0")
	}
	if got := decoded.Messages[2].ChunkID; got != "c1" {
		t.Fatalf("tool msg 1 chunk_id = %q, want %q", got, "c1")
	}
	if got := decoded.Messages[0].ChunkID; got != "" {
		t.Fatalf("user msg chunk_id = %q, want empty", got)
	}
}

func TestRecordedRequestTagsAnnotateShapeByChunkID(t *testing.T) {
	// Untouched annotate/block shape: 3 tools, only c0/c2 kept.
	req := toolRequest("alpha", "beta", "gamma")
	raw := recordedRequest(req, []string{"c0", "c2"})
	var decoded struct {
		Messages []struct {
			Role    string `json:"role"`
			ChunkID string `json:"chunk_id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatalf("recordedRequest invalid JSON: %v", err)
	}
	want := map[int]string{1: "c0", 2: "", 3: "c2"}
	for i, id := range want {
		if got := decoded.Messages[i].ChunkID; got != id {
			t.Fatalf("msg %d chunk_id = %q, want %q", i, got, id)
		}
	}
}
