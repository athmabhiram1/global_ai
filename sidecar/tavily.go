package main

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// tavilyChainFromEnv builds the sidecar Tavily chain: relay first (Bifrost
// prices and logs the call), direct HTTPS as the guaranteed path. A nil
// return means no usable transport: no relay reachable and no API key.
func tavilyChainFromEnv() retriever.Retriever {
	byName := map[string]retriever.Retriever{}
	order := []string{"relay", "http"}
	if base := strings.TrimSpace(os.Getenv("BIFROST_URL")); base != "" {
		byName["relay"] = retriever.NewRelay(base, "tavily", &http.Client{Timeout: 5 * time.Second})
	} else {
		byName["relay"] = retriever.NewRelay("http://127.0.0.1:8080", "tavily", &http.Client{Timeout: 5 * time.Second})
	}
	if key := strings.TrimSpace(os.Getenv("TAVILY_API_KEY")); key != "" && key != "unused" {
		byName["http"] = retriever.NewHTTP("https://api.tavily.com", key, &http.Client{Timeout: 5 * time.Second})
	}
	if len(byName) == 0 {
		return nil
	}
	return retriever.NewChain(order, byName).AsRetriever()
}
