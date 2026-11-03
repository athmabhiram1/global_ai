// Command support asks the curated stack the pricing question and prints
// the answer. The mock provider echoes the curated request, so the answer
// contains the price only when admission kept the authoritative chunk.
package main

import (
	"fmt"
	"os"

	"github.com/athmabhiram/context-curator/examples/apps/client"
)

const question = "How much is Pro?"

func run(baseURL, seedDir string) (string, error) {
	pages, err := client.LoadPages(seedDir)
	if err != nil {
		return "", err
	}
	model := os.Getenv("MODEL")
	if model == "" {
		model = "mock/mock-model"
	}
	return client.Ask(baseURL, model, question, pages)
}

func main() {
	baseURL := os.Getenv("BIFROST_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	seedDir := os.Getenv("SEED_DIR")
	if seedDir == "" {
		seedDir = "../seed/pages"
	}
	answer, err := run(baseURL, seedDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "support:", err)
		os.Exit(1)
	}
	fmt.Println(answer)
}
