// Command cc-sidecar serves the Context Curator API and UI.
//
// It is a separate process from Bifrost because a Go plugin cannot register
// HTTP routes. The two share one SQLite database.
package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	addr := flag.String("addr", ":8090", "listen address")
	check := flag.String("check", "", "probe a URL and exit 0 on 200")
	flag.Parse()

	if *check != "" {
		os.Exit(probe(*check))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok","service":"cc-sidecar"}`)
	})

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	fmt.Fprintf(os.Stderr, "cc-sidecar listening on %s\n", *addr)
	if err := srv.ListenAndServe(); err != nil {
		fmt.Fprintf(os.Stderr, "cc-sidecar: %v\n", err)
		os.Exit(1)
	}
}

func probe(url string) int {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
