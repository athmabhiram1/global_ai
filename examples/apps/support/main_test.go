// FROZEN — DO NOT EDIT. Wave 3.1 support-app acceptance test.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"os"
	"strings"
	"testing"

	"github.com/athmabhiram/context-curator/examples/apps/client"
)

func ask(t *testing.T, baseURL, question string) string {
	t.Helper()
	seedDir := os.Getenv("SEED_DIR")
	if seedDir == "" {
		seedDir = "../seed/pages"
	}
	pages, err := client.LoadPages(seedDir)
	if err != nil {
		t.Fatal(err)
	}
	model := os.Getenv("MODEL")
	if model == "" {
		model = "mock/mock-model"
	}
	answer, err := client.Ask(baseURL, model, question, pages)
	if err != nil {
		t.Fatal(err)
	}
	return answer
}

func TestSupportAnswersPricing(t *testing.T) {
	baseURL := os.Getenv("BIFROST_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	if got := ask(t, baseURL, "How much is Pro?"); !strings.Contains(got, "$") {
		t.Fatalf("answer = %q, want a price", got)
	}
}
