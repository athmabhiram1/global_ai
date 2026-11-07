package main

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/athmabhiram/context-curator/plugin/retriever"
)

// defaultRetriever builds the production Tavily transport for the request
// pipeline. Direct HTTPS only: the relay endpoint lives on the same gateway
// process this hook is running inside, so calling it would re-enter the
// pipeline. A missing key means no retriever: Refresh degrades to keeping
// stale chunks untouched, and the decision records zero credits.
//
// The transport timeout comes from policy (default 900 ms); Tavily failure
// is always degradation, never a block.
func defaultRetriever() retriever.Retriever {
	key := strings.TrimSpace(os.Getenv("TAVILY_API_KEY"))
	if key == "" || key == "unused" {
		return nil
	}
	timeout := 900 * time.Millisecond
	if activeConfig != nil && activeConfig.Tavily.TimeoutMs > 0 {
		timeout = time.Duration(activeConfig.Tavily.TimeoutMs) * time.Millisecond
	}
	return retriever.NewHTTP("https://api.tavily.com", key, &http.Client{Timeout: timeout})
}
