// FROZEN — DO NOT EDIT. Task 1.7 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
)

func toolTexts(req *schemas.BifrostRequest) []string {
	var out []string
	for _, m := range req.ChatRequest.Input {
		if m.Role == schemas.ChatMessageRoleTool {
			out = append(out, messageText(m))
		}
	}
	return out
}

func toolCallIDs(req *schemas.BifrostRequest) []string {
	var out []string
	for _, m := range req.ChatRequest.Input {
		if m.Role == schemas.ChatMessageRoleTool && m.ChatToolMessage != nil && m.ChatToolMessage.ToolCallID != nil {
			out = append(out, *m.ChatToolMessage.ToolCallID)
		}
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestRewriteKeepsOrderAndToolIDs(t *testing.T) {
	req := toolRequest("a", "b", "c")
	before := toolCallIDs(req)
	if err := Rewrite(req, []Chunk{{ID: "c0", Text: "a"}, {ID: "c2", Text: "c"}}); err != nil {
		t.Fatal(err)
	}
	if got := toolTexts(req); !equalStrings(got, []string{"a", "c"}) {
		t.Fatalf("tool contents = %q", got)
	}
	if got := toolCallIDs(req); !equalStrings(got, before[:2]) {
		t.Fatalf("tool call ids = %q, want %q", got, before[:2])
	}
}

func TestRewriteRemovesFullyDroppedMessages(t *testing.T) {
	req := toolRequest("a", "b", "c")
	if err := Rewrite(req, []Chunk{{ID: "c0", Text: "a"}}); err != nil {
		t.Fatal(err)
	}
	if got := toolTexts(req); !equalStrings(got, []string{"a"}) {
		t.Fatalf("tool contents = %q, want only [a]", got)
	}
}

func TestRewriteAppendsSourceList(t *testing.T) {
	req := toolRequest("see this")
	kept := []Chunk{{ID: "c0", Text: "see this", SourceURLs: []string{"https://x.example", "https://y.example"}}}
	if err := Rewrite(req, kept); err != nil {
		t.Fatal(err)
	}
	last := req.ChatRequest.Input[len(req.ChatRequest.Input)-1]
	if last.Role != schemas.ChatMessageRoleSystem {
		t.Fatalf("last message role = %q, want system source list", last.Role)
	}
	body := messageText(last)
	for _, u := range []string{"https://x.example", "https://y.example"} {
		if !containsStr(body, u) {
			t.Fatalf("source list %q missing %q", body, u)
		}
	}
}

func TestRewriteNoSourceListWithoutURLs(t *testing.T) {
	req := toolRequest("plain text")
	n := len(req.ChatRequest.Input)
	if err := Rewrite(req, []Chunk{{ID: "c0", Text: "plain text"}}); err != nil {
		t.Fatal(err)
	}
	if len(req.ChatRequest.Input) != n {
		t.Fatal("source list appended with no URLs to cite")
	}
}

func TestRewriteNilSafe(t *testing.T) {
	if err := Rewrite(nil, nil); err != nil {
		t.Fatalf("Rewrite(nil) = %v, want nil", err)
	}
	if err := Rewrite(&schemas.BifrostRequest{}, nil); err != nil {
		t.Fatalf("Rewrite(no chat) = %v, want nil", err)
	}
}

func TestRewriteProseUntouched(t *testing.T) {
	req := toolRequest("tool payload")
	userBefore := messageText(req.ChatRequest.Input[0])
	if err := Rewrite(req, []Chunk{{ID: "c0", Text: "tool payload"}}); err != nil {
		t.Fatal(err)
	}
	if got := messageText(req.ChatRequest.Input[0]); got != userBefore {
		t.Fatalf("user prose changed: %q", got)
	}
}

func TestHandleAnnotateNeverRewrites(t *testing.T) {
	req := toolRequest("alpha https://a.example.com/x", "beta", "gamma")
	before := snapshotTexts(req)
	p := &pipeline{cfg: DefaultConfig()}
	d, err := p.handle(nil, req)
	if err != nil {
		t.Fatal(err)
	}
	if got := snapshotTexts(req); !equalStrings(got, before) {
		t.Fatal("annotate mode changed the request")
	}
	if err := d.Validate(); err != nil {
		t.Fatalf("decision invalid: %v", err)
	}
	if d.ChunksIn != 3 || d.ChunksKept+droppedCount(d) != 3 {
		t.Fatalf("decision = %+v, counts do not cover input", d)
	}
}

func TestHandleHardDenyBlocksInBlockMode(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Mode = ModeBlock
	cfg.Authority.Deny = []string{"farm.example"}
	req := toolRequest("stolen goods https://farm.example/item")
	p := &pipeline{cfg: cfg}
	before := snapshotTexts(req)
	if _, err := p.handle(nil, req); err == nil {
		t.Fatal("expected block error for denied known domain")
	}
	if got := snapshotTexts(req); !equalStrings(got, before) {
		t.Fatal("blocked request was rewritten")
	}
}

func TestHandleNonChatPassesThrough(t *testing.T) {
	p := &pipeline{cfg: DefaultConfig()}
	d, err := p.handle(nil, &schemas.BifrostRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if err := d.Validate(); err != nil {
		t.Fatalf("decision invalid: %v", err)
	}
}

func TestHandleEmptyContext(t *testing.T) {
	req := &schemas.BifrostRequest{ChatRequest: &schemas.BifrostChatRequest{Input: []schemas.ChatMessage{
		{Role: schemas.ChatMessageRoleUser, Content: &schemas.ChatMessageContent{ContentStr: ptr("just prose")}},
	}}}
	p := &pipeline{cfg: DefaultConfig()}
	d, err := p.handle(nil, req)
	if err != nil {
		t.Fatal(err)
	}
	if d.ChunksIn != 0 || d.ChunksKept != 0 {
		t.Fatalf("decision = %+v, want empty", d)
	}
	if err := d.Validate(); err != nil {
		t.Fatalf("decision invalid: %v", err)
	}
}

func snapshotTexts(req *schemas.BifrostRequest) []string {
	var out []string
	for _, m := range req.ChatRequest.Input {
		out = append(out, string(m.Role)+":"+messageText(m))
	}
	return out
}

func droppedCount(d *Decision) int { return len(d.Dropped) }

func containsStr(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
