// Command mock-provider is an OpenAI-compatible chat completions endpoint that
// echoes back exactly what it received.
//
// It exists for two reasons:
//
//  1. Wave 0.3 needs proof that a PreRequestHook rewrite reaches the provider and
//     survives a fallback. Echoing the received messages is the cheapest possible
//     assertion: if the marker is in the reply, it was in the request.
//  2. The demo needs a provider whose answer is identical on every run, so the
//     "wrong answer then right answer" beat cannot fail on stage.
//
// It speaks just enough of the OpenAI surface for Bifrost's openai provider type:
// POST /v1/chat/completions.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// Message is the subset of the OpenAI message shape we care about.
type Message struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content,omitempty"`
	Name    string          `json:"name,omitempty"`
}

// ChatRequest is the subset of the OpenAI chat request we read.
type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

type choice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

type usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type chatResponse struct {
	ID      string   `json:"id"`
	Object  string   `json:"object"`
	Created int64    `json:"created"`
	Model   string   `json:"model"`
	Choices []choice `json:"choices"`
	Usage   usage    `json:"usage"`
}

func main() {
	addr := flag.String("addr", ":8099", "listen address")
	answer := flag.String("answer", "", "fixed answer; empty means echo the request")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"status":"ok"}`)
	})
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		handleChat(w, r, *answer)
	})
	mux.HandleFunc("/v1/models", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"object":"list","data":[{"id":"mock-model","object":"model"}]}`)
	})

	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("mock-provider listening on %s", *addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func handleChat(w http.ResponseWriter, r *http.Request, fixedAnswer string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Log what actually arrived. This is the assertion surface for Wave 0.3 and
	// the debugging surface when a demo behaves unexpectedly.
	for _, m := range req.Messages {
		log.Printf("recv role=%s content=%s", m.Role, truncate(extractText(m.Content), 400))
	}

	content := fixedAnswer
	if content == "" {
		content = echo(req.Messages)
	}

	if req.Stream {
		writeStream(w, req.Model, content)
		return
	}

	resp := chatResponse{
		ID:      "chatcmpl-mock",
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   req.Model,
		Choices: []choice{{
			Index:        0,
			Message:      Message{Role: "assistant", Content: mustJSON(content)},
			FinishReason: "stop",
		}},
		Usage: usage{PromptTokens: estimateTokens(req.Messages), CompletionTokens: len(strings.Fields(content))},
	}
	resp.Usage.TotalTokens = resp.Usage.PromptTokens + resp.Usage.CompletionTokens

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// echo renders the received conversation back as the assistant reply, so a test
// can assert on exactly what the provider was given.
func echo(msgs []Message) string {
	var b strings.Builder
	b.WriteString("RECEIVED:\n")
	for _, m := range msgs {
		b.WriteString(m.Role)
		b.WriteString(": ")
		b.WriteString(extractText(m.Content))
		b.WriteString("\n")
	}
	return b.String()
}

func writeStream(w http.ResponseWriter, model, content string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)

	for _, chunk := range splitForStream(content) {
		payload := map[string]any{
			"id":      "chatcmpl-mock",
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   model,
			"choices": []map[string]any{{
				"index": 0,
				"delta": map[string]string{"content": chunk},
			}},
		}
		raw, _ := json.Marshal(payload)
		fmt.Fprintf(w, "data: %s\n\n", raw)
		if flusher != nil {
			flusher.Flush()
		}
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
	if flusher != nil {
		flusher.Flush()
	}
}

func splitForStream(s string) []string {
	const size = 24
	var out []string
	for len(s) > size {
		out = append(out, s[:size])
		s = s[size:]
	}
	if s != "" {
		out = append(out, s)
	}
	return out
}

// extractText handles both the plain-string and the content-parts shapes.
func extractText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err == nil {
		var b strings.Builder
		for _, p := range parts {
			b.WriteString(p.Text)
		}
		return b.String()
	}
	return string(raw)
}

func estimateTokens(msgs []Message) int {
	n := 0
	for _, m := range msgs {
		n += len(strings.Fields(extractText(m.Content))) + 3
	}
	return n
}

func mustJSON(v any) json.RawMessage {
	raw, err := json.Marshal(v)
	if err != nil {
		os.Exit(1)
	}
	return raw
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
