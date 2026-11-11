package main

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// tavilyKeyUsable reports whether TAVILY_API_KEY names a real credential.
// The shipped default ("unused") and the .env.example template value would
// otherwise build a chain whose relay inevitably 401s, surfacing as a 502
// on a stock container. Fail those fast as "not configured" (503).
func tavilyKeyUsable() bool {
	key := strings.TrimSpace(os.Getenv("TAVILY_API_KEY"))
	if key == "" || strings.EqualFold(key, "unused") {
		return false
	}
	return !strings.Contains(key, "your-") && !strings.HasSuffix(key, "-here")
}

// tavilyChainFromEnv builds the sidecar Tavily chain: relay first (Bifrost
// prices and logs the call), direct HTTPS as the guaranteed path. A nil
// return means no usable transport: no real API key (the relay forwards the
// same credential, so a placeholder key cannot work there either).
func tavilyChainFromEnv() retriever.Retriever {
	if !tavilyKeyUsable() {
		return nil
	}
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
