// FROZEN — DO NOT EDIT. Wave 3.1 client acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package client

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildRequestShape(t *testing.T) {
	req := BuildRequest("mock/mock-model", "How much is Pro?", []string{"a", "b"})
	msgs, ok := req["messages"].([]map[string]string)
	if !ok || len(msgs) != 3 {
		t.Fatalf("messages = %v, want user + 2 tool", req["messages"])
	}
	if msgs[0]["role"] != "user" || msgs[0]["content"] != "How much is Pro?" {
		t.Fatalf("first message = %v", msgs[0])
	}
	if msgs[1]["role"] != "tool" || msgs[2]["role"] != "tool" {
		t.Fatalf("pages must ride as tool messages: %v", msgs[1:])
	}
	if req["model"] != "mock/mock-model" || req["temperature"] != 0.0 {
		t.Fatalf("model/temperature = %v", req)
	}
}

func TestParseAnswerStringContent(t *testing.T) {
	body := []byte(`{"choices":[{"message":{"content":"hello $49"}}],"usage":{"total_tokens":9}}`)
	got, tokens, err := ParseAnswer(body)
	if err != nil || got != "hello $49" || tokens != 9 {
		t.Fatalf("got %q %d %v", got, tokens, err)
	}
}

func TestParseAnswerArrayContent(t *testing.T) {
	body := []byte(`{"choices":[{"message":{"content":[{"type":"text","text":"hi"}]}}]}`)
	got, _, err := ParseAnswer(body)
	if err != nil || got != "hi" {
		t.Fatalf("got %q %v", got, err)
	}
}

func TestParseAnswerEmptyChoicesErrors(t *testing.T) {
	if _, _, err := ParseAnswer([]byte(`{"choices":[]}`)); err == nil {
		t.Fatal("expected error for empty choices")
	}
}

func TestParseAnswerBadJSONErrors(t *testing.T) {
	if _, _, err := ParseAnswer([]byte(`{oops`)); err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestLoadPagesSortedMarkdownOnly(t *testing.T) {
	dir := t.TempDir()
	for name, content := range map[string]string{
		"b.md": "B", "a.md": "A", "skip.txt": "X",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	pages, err := LoadPages(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 2 || pages[0] != "A" || pages[1] != "B" {
		t.Fatalf("pages = %q, want sorted markdown only", pages)
	}
}

func TestLoadPagesMissingDirErrors(t *testing.T) {
	if _, err := LoadPages(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("expected error for missing seed dir")
	}
}
