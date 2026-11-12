package main

import (
	"encoding/json"
	"testing"
)

// Rewrite-mode admission drops chunks, so the recorded (post-rewrite)
// request differs from the client body. The decision must still correlate
// by the ORIGINAL body, or the gateway response loses x-cc-decision-id.
func TestRewriteDecisionCorrelatesByOriginalBody(t *testing.T) {
	clearCorrelate()
	cfg := DefaultConfig()
	cfg.Mode = ModeRewrite
	cfg.Authority.Deny = []string{"farm.example"}
	req := toolRequest("good https://a.example.com/x", "stolen https://farm.example/item")
	p := newPipeline(cfg)
	d, err := p.handle(testContext(), req)
	if err != nil {
		t.Fatalf("handle: %v", err)
	}
	if len(d.Dropped) == 0 {
		t.Fatal("want a dropped chunk in the rewrite fixture")
	}
	raw, _ := json.Marshal(map[string]any{
		"model": "mock/mock-model",
		"messages": []map[string]string{
			{"role": "user", "content": toolRequestUserText},
			{"role": "tool", "content": "good https://a.example.com/x"},
			{"role": "tool", "content": "stolen https://farm.example/item"},
		},
	})
	id, ok := lookupDecisionByBody(raw)
	if !ok || id != d.RequestID {
		t.Fatalf("lookupDecisionByBody = (%q, %v), want (%q, true)", id, ok, d.RequestID)
	}
}
