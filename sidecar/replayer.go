// Wave 2 Task 2.4: counterfactual replay against the gateway.
//
// GatewayReplayer re-sends a recorded OpenAI-style chat request to Bifrost's
// own inference endpoint with one chunk's messages removed, at temperature 0,
// carrying the loopback bypass header the plugin honours. It never touches
// the admission path: replay is a read-only probe for autopsy.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// GatewayReplayer posts replays to baseURL + "/v1/chat/completions".
// token is attached as a Bearer [REDACTED] when non-empty.
type GatewayReplayer struct {
	baseURL string
	token   string
	client  *http.Client
}

// NewGatewayReplayer wires a replayer with a bounded client. A trailing slash
// on baseURL is tolerated so callers can pass the gateway origin verbatim.
func NewGatewayReplayer(baseURL, token string) *GatewayReplayer {
	return &GatewayReplayer{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		token:   token,
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

// Replay re-sends req with every message whose content contains dropChunk
// removed, at temperature 0, and returns the concatenated choices text. A
// non-2xx provider status is an error: autopsy must never score silence as
// "no influence". An empty dropChunk removes nothing.
func (g *GatewayReplayer) Replay(ctx context.Context, req string, dropChunk string) (string, error) {
	var payload map[string]any
	if err := json.Unmarshal([]byte(req), &payload); err != nil {
		return "", fmt.Errorf("replayer: invalid request JSON: %w", err)
	}
	if msgs, ok := payload["messages"].([]any); ok {
		kept := make([]any, 0, len(msgs))
		for _, msg := range msgs {
			if dropChunk != "" {
				if fields, ok := msg.(map[string]any); ok {
					if content, ok := fields["content"].(string); ok && strings.Contains(content, dropChunk) {
						continue
					}
				}
			}
			kept = append(kept, msg)
		}
		payload["messages"] = kept
	}
	payload["temperature"] = 0

	out, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("replayer: encode replay: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+"/v1/chat/completions", bytes.NewReader(out))
	if err != nil {
		return "", fmt.Errorf("replayer: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-cc-bypass", "1")
	if g.token != "" {
		httpReq.Header.Set("Authorization", "Bearer "+g.token)
	}
	resp, err := g.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("replayer: provider call: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", fmt.Errorf("replayer: provider status %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&completion); err != nil {
		return "", fmt.Errorf("replayer: decode completion: %w", err)
	}
	var sb strings.Builder
	for _, choice := range completion.Choices {
		sb.WriteString(replayChoiceText(choice.Message.Content))
	}
	return sb.String(), nil
}

// replayChoiceText flattens one message content: a plain string as-is, a
// list of content parts via their text fields, anything else as empty.
func replayChoiceText(content any) string {
	switch text := content.(type) {
	case string:
		return text
	case []any:
		var sb strings.Builder
		for _, part := range text {
			if fields, ok := part.(map[string]any); ok {
				if piece, ok := fields["text"].(string); ok {
					sb.WriteString(piece)
				}
			}
		}
		return sb.String()
	default:
		return ""
	}
}

// replayerFromEnv wires the production GatewayReplayer: the in-container
// gateway by default (BIFROST_URL overrides), Bearer CC_GATEWAY_TOKEN when set.
// Missing this wiring was a production 500 on every autopsy call: NewServer
// leaves Replayer nil and the unit tests inject a stub, so nothing caught it.
func replayerFromEnv() *GatewayReplayer {
	base := strings.TrimSpace(os.Getenv("BIFROST_URL"))
	if base == "" {
		base = "http://127.0.0.1:8080"
	}
	return NewGatewayReplayer(base, strings.TrimSpace(os.Getenv("CC_GATEWAY_TOKEN")))
}
