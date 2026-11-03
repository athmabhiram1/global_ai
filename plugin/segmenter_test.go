// FROZEN — DO NOT EDIT. Task 1.2 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"testing"

	"github.com/maximhq/bifrost/core/schemas"
)

func toolRequest(texts ...string) *schemas.BifrostRequest {
	msgs := make([]schemas.ChatMessage, 0, len(texts)+1)
	msgs = append(msgs, schemas.ChatMessage{
		Role:    schemas.ChatMessageRoleUser,
		Content: &schemas.ChatMessageContent{ContentStr: ptr("please summarize this long pasted document at length")},
	})
	for i, text := range texts {
		id := "call-" + string(rune('a'+i))
		msgs = append(msgs, schemas.ChatMessage{
			Role:            schemas.ChatMessageRoleTool,
			Content:         &schemas.ChatMessageContent{ContentStr: ptr(text)},
			ChatToolMessage: &schemas.ChatToolMessage{ToolCallID: &id},
		})
	}
	return &schemas.BifrostRequest{ChatRequest: &schemas.BifrostChatRequest{Input: msgs}}
}

func TestSegmentOnlyToolMessages(t *testing.T) {
	chunks, err := Segment(toolRequest("alpha", "beta", "gamma"))
	if err != nil {
		t.Fatal(err)
	}
	if len(chunks) != 3 {
		t.Fatalf("chunks = %d, want 3", len(chunks))
	}
	for i, c := range chunks {
		if c.Role == "user" {
			t.Fatalf("user prose segmented: %s", c.ID)
		}
		want := "c" + string(rune('0'+i))
		if c.ID != want {
			t.Fatalf("chunk %d ID = %q, want %q", i, c.ID, want)
		}
	}
}

func TestSegmentIgnoresUserProse(t *testing.T) {
	req := &schemas.BifrostRequest{ChatRequest: &schemas.BifrostChatRequest{Input: []schemas.ChatMessage{
		{Role: schemas.ChatMessageRoleUser, Content: &schemas.ChatMessageContent{ContentStr: ptr("a very long user pasted document")}},
		{Role: schemas.ChatMessageRoleSystem, Content: &schemas.ChatMessageContent{ContentStr: ptr("system prompt")}},
	}}}
	chunks, err := Segment(req)
	if err != nil {
		t.Fatal(err)
	}
	if len(chunks) != 0 {
		t.Fatalf("chunks = %d, want 0 (prose and system must never segment)", len(chunks))
	}
}

func TestSegmentNilSafe(t *testing.T) {
	for _, req := range []*schemas.BifrostRequest{nil, {}, {ChatRequest: &schemas.BifrostChatRequest{}}} {
		chunks, err := Segment(req)
		if err != nil {
			t.Fatalf("Segment(%v) error = %v, want nil", req, err)
		}
		if len(chunks) != 0 {
			t.Fatalf("Segment(%v) = %d chunks, want empty", req, len(chunks))
		}
	}
}

func TestSegmentSkipsEmptyToolContent(t *testing.T) {
	req := toolRequest("", "nonempty")
	chunks, err := Segment(req)
	if err != nil {
		t.Fatal(err)
	}
	if len(chunks) != 1 || chunks[0].Text != "nonempty" {
		t.Fatalf("chunks = %+v, want exactly the nonempty chunk", chunks)
	}
}

func TestSegmentPreservesToolCallID(t *testing.T) {
	chunks, err := Segment(toolRequest("payload"))
	if err != nil {
		t.Fatal(err)
	}
	if len(chunks) != 1 || chunks[0].ToolCallID != "call-a" {
		t.Fatalf("chunks = %+v, want ToolCallID call-a", chunks)
	}
}

func TestCountIsDeterministic(t *testing.T) {
	c := NewTokenCounter()
	if c.Count("a b c") != c.Count("a b c") || c.Method() == "" {
		t.Fatal("unstable count or empty method")
	}
}

func TestCountEmptyIsZero(t *testing.T) {
	if got := NewTokenCounter().Count(""); got != 0 {
		t.Fatalf("Count(\"\") = %d, want 0", got)
	}
}
