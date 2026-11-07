package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
)

// New coverage, not frozen: content-hash side-channel between transport
// hooks and core hooks, which share no *BifrostContext root.

const toolRequestUserText = "please summarize this long pasted document at length"

func TestTranscriptEquivalenceBodyVsRequest(t *testing.T) {
	clearCorrelate()
	body := []byte(`{"model":"mock/mock-model","messages":[{"role":"user","content":"please summarize this long pasted document at length"},{"role":"tool","content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]},{"role":"tool","content":null}]}`)
	req := toolRequest("ab", "")
	fromBody := hashMessages(transcriptOfBody(body))
	fromReq := hashMessages(transcriptOfRequest(req))
	if fromBody == "" || fromReq == "" {
		t.Fatalf("empty transcript hash: body=%q req=%q", fromBody, fromReq)
	}
	if fromBody != fromReq {
		t.Fatalf("transport and core transcripts diverge:\nbody %q\nreq  %q", fromBody, fromReq)
	}
}

func TestDecisionCorrelatesByBody(t *testing.T) {
	clearCorrelate()
	req := toolRequest("alpha https://a.example.com/x")
	rememberDecision(req, "dec-1")
	raw, _ := json.Marshal(map[string]any{
		"model": "mock/mock-model",
		"messages": []map[string]string{
			{"role": "user", "content": toolRequestUserText},
			{"role": "tool", "content": "alpha https://a.example.com/x"},
		},
	})
	hookReq := &schemas.HTTPRequest{Body: raw}
	resp := &schemas.HTTPResponseMetadata{Headers: map[string]string{}}
	if err := HTTPTransportResponseHeadersHook(testContext(), hookReq, resp); err != nil {
		t.Fatal(err)
	}
	if resp.Header("x-cc-decision-id") != "dec-1" {
		t.Fatalf("header = %q, want dec-1", resp.Header("x-cc-decision-id"))
	}
}

func TestUnknownBodySetsNoHeader(t *testing.T) {
	clearCorrelate()
	hookReq := &schemas.HTTPRequest{Body: []byte(`{"messages":[{"role":"user","content":"never seen"}]}`)}
	resp := &schemas.HTTPResponseMetadata{Headers: map[string]string{}}
	if err := HTTPTransportResponseHeadersHook(testContext(), hookReq, resp); err != nil {
		t.Fatal(err)
	}
	if got := resp.Header("x-cc-decision-id"); got != "" {
		t.Fatalf("unknown body must set no header, got %q", got)
	}
	if err := HTTPTransportResponseHeadersHook(nil, nil, nil); err != nil {
		t.Fatalf("nil hook args must not fail: %v", err)
	}
}

func TestBypassedReplaySetsNoHeader(t *testing.T) {
	clearCorrelate()
	req := toolRequest("alpha")
	rememberDecision(req, "dec-1")
	raw, _ := json.Marshal(map[string]any{
		"messages": []map[string]string{{"role": "user", "content": toolRequestUserText}, {"role": "tool", "content": "alpha"}},
	})
	hookReq := &schemas.HTTPRequest{
		Headers: map[string]string{"x-cc-bypass": "1"},
		Body:    raw,
	}
	resp := &schemas.HTTPResponseMetadata{Headers: map[string]string{}}
	if err := HTTPTransportResponseHeadersHook(testContext(), hookReq, resp); err != nil {
		t.Fatal(err)
	}
	if got := resp.Header("x-cc-decision-id"); got != "" {
		t.Fatalf("bypassed replay must set no header, got %q", got)
	}
}

func TestBypassTravelsByHash(t *testing.T) {
	clearCorrelate()
	raw := []byte(`{"messages":[{"role":"user","content":"` + toolRequestUserText + `"},{"role":"tool","content":"payload"}]}`)
	preReq := &schemas.HTTPRequest{Headers: map[string]string{"X-CC-Bypass": "1"}, Body: raw}
	if _, err := HTTPTransportPreHook(testContext(), preReq); err != nil {
		t.Fatal(err)
	}
	coreReq := toolRequest("payload")
	if !shouldBypassHash(coreReq) {
		t.Fatal("bypass mark set by transport hook must be visible to core by hash")
	}
	if shouldBypassHash(coreReq) {
		t.Fatal("bypass mark must be single-use: replay consumes it, a later twin curates normally")
	}
	if shouldBypassHash(toolRequest("something else")) {
		t.Fatal("different content must not bypass")
	}
}

func TestBypassMarkExpires(t *testing.T) {
	clearCorrelate()
	old := bypassTTL
	bypassTTL = -time.Second
	defer func() { bypassTTL = old }()
	raw := []byte(`{"messages":[{"role":"user","content":"` + toolRequestUserText + `"},{"role":"tool","content":"payload"}]}`)
	preReq := &schemas.HTTPRequest{Headers: map[string]string{"x-cc-bypass": "1"}, Body: raw}
	if _, err := HTTPTransportPreHook(testContext(), preReq); err != nil {
		t.Fatal(err)
	}
	if shouldBypassHash(toolRequest("payload")) {
		t.Fatal("expired bypass mark must not skip curation")
	}
}

func TestExposeListGainsDecisionID(t *testing.T) {
	clearCorrelate()
	req := toolRequest("alpha")
	rememberDecision(req, "dec-9")
	raw, _ := json.Marshal(map[string]any{
		"messages": []map[string]string{{"role": "user", "content": toolRequestUserText}, {"role": "tool", "content": "alpha"}},
	})
	hookReq := &schemas.HTTPRequest{Body: raw}
	resp := &schemas.HTTPResponseMetadata{Headers: map[string]string{
		"Access-Control-Expose-Headers": "x-bifrost-request-id",
	}}
	if err := HTTPTransportResponseHeadersHook(testContext(), hookReq, resp); err != nil {
		t.Fatal(err)
	}
	expose := resp.Header("Access-Control-Expose-Headers")
	if !strings.Contains(strings.ToLower(expose), "x-cc-decision-id") {
		t.Fatalf("expose list must gain the id header, got %q", expose)
	}
}
