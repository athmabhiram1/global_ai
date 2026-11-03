// FROZEN — Wave 2 Task 2.4 acceptance tests. Do not edit without a plan
// amendment: failing tests mean the replayer is wrong, never the tests.
package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

type capturedReplay struct {
	mu       sync.Mutex
	body     map[string]any
	messages []any
	bypass   string
}

func replayProbe(t *testing.T, cap *capturedReplay, status int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Errorf("provider got invalid JSON: %v", err)
		}
		cap.mu.Lock()
		cap.body = decoded
		if msgs, ok := decoded["messages"].([]any); ok {
			cap.messages = msgs
		}
		cap.bypass = r.Header.Get("x-cc-bypass")
		cap.mu.Unlock()
		if status != http.StatusOK {
			http.Error(w, "provider exploded", status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"kept answer"}}]}`))
	}))
}

const replayRequest = `{"model":"probe-model","messages":[` +
	`{"role":"system","content":"you are helpful"},` +
	`{"role":"user","content":"kept question about prices"},` +
	`{"role":"user","content":"DROPME poison chunk text"}]}`
const replayRequestMultiChoice = replayRequest

func TestReplayDropsOnlyMatchingChunk(t *testing.T) {
	var cap capturedReplay
	provider := replayProbe(t, &cap, http.StatusOK)
	defer provider.Close()

	g := NewGatewayReplayer(provider.URL, "")
	got, err := g.Replay(context.Background(), replayRequest, "DROPME")
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
	}
	joined := seen.String()
	if !strings.Contains(joined, "kept question about prices") {
		t.Fatalf("provider never saw kept text; saw: %q", joined)
	}
	if strings.Contains(joined, "DROPME") {
		t.Fatalf("provider saw dropped chunk; saw: %q", joined)
	}
}

func TestReplaySendsBypassHeaderAndZeroTemperature(t *testing.T) {
	var cap capturedReplay
	provider := replayProbe(t, &cap, http.StatusOK)
	defer provider.Close()

	g := NewGatewayReplayer(provider.URL, "")
	if _, err := g.Replay(context.Background(), replayRequestMultiChoice, "DROPME"); err != nil {
		t.Fatalf("Replay = %v, want nil error", err)
	}

	cap.mu.Lock()
	defer cap.mu.Unlock()
	if cap.bypass != "1" {
		t.Fatalf("x-cc-bypass = %q, want %q", cap.bypass, "1")
	}
	temp, ok := cap.body["temperature"]
	if !ok {
		t.Fatal("replay never set temperature")
	}
	if tempNum, ok := temp.(float64); !ok || tempNum != 0 {
		t.Fatalf("temperature = %v (%T), want 0", temp, temp)
	}
}

func TestReplayProviderErrorSurfaces(t *testing.T) {
	var cap capturedReplay
	provider := replayProbe(t, &cap, http.StatusInternalServerError)
	defer provider.Close()

	g := NewGatewayReplayer(provider.URL, "")
	if _, err := g.Replay(context.Background(), replayRequest, "DROPME"); err == nil {
		t.Fatal("provider 500 must surface as an error")
	}
}
