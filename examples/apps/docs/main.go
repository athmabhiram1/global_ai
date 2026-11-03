// Command docs asks the curated stack the version question and prints
// the answer.
package main

import (
	"fmt"
	"os"

	"github.com/athmabhiram/context-curator/examples/apps/client"
)

const question = "What Go version does 3.2 need?"

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
		fmt.Fprintln(os.Stderr, "docs:", err)
		os.Exit(1)
	}
	fmt.Println(answer)
}
