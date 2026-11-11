package main

import (
	"context"
	"strings"
	"testing"
)

// Task 3: Replay removes by chunk_id exact match even when content differs,
// and keeps the content-contains fallback for old rows without chunk_id.
const replayRequestChunkID = `{"model":"probe-model","messages":[` +
	`{"role":"system","content":"you are helpful"},` +
	`{"role":"tool","content":"totally unrelated prose","chunk_id":"c9"},` +
	`{"role":"user","content":"kept question"}]}`

func TestReplayChunkIdRemovesById(t *testing.T) {
	var cap capturedReplay
	provider := replayProbe(t, &cap, 200)
	defer provider.Close()

	g := NewGatewayReplayer(provider.URL, "")
	got, err := g.Replay(context.Background(), replayRequestChunkID, "c9")
	if err != nil {
		t.Fatalf("Replay = %v, want nil error", err)
	}
	if got != "kept answer" {
		t.Fatalf("Replay = %q, want %q", got, "kept answer")
	}

	cap.mu.Lock()
	defer cap.mu.Unlock()
	var seen strings.Builder
	for _, m := range cap.messages {
		mm, ok := m.(map[string]any)
		if !ok {
			continue
		}
		if content, ok := mm["content"].(string); ok {
			seen.WriteString(content + "\n")
		}
		if id, ok := mm["chunk_id"].(string); ok {
			seen.WriteString("ID:" + id + "\n")
		}
	}
	joined := seen.String()
	if !strings.Contains(joined, "kept question") {
		t.Fatalf("provider never saw kept text; saw: %q", joined)
	}
	if strings.Contains(joined, "ID:c9") || strings.Contains(joined, "totally unrelated prose") {
		t.Fatalf("provider saw dropped chunk_id c9; saw: %q", joined)
	}
}
