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

	"github.com/athmabhiram/context-curator/plugin/store"
)

func main() {
	addr := flag.String("addr", ":8090", "listen address")
	check := flag.String("check", "", "probe a URL and exit 0 on 200")
	flag.Parse()

	if *check != "" {
		os.Exit(probe(*check))
	}

	storePath := os.Getenv("CC_STORE_PATH")
	if storePath == "" {
		storePath = "/data/contextcurator.db"
	}
	policyPath := os.Getenv("CC_POLICY_PATH")
	if policyPath == "" {
		policyPath = "config/contextcurator.yaml"
	}

	var st *store.Store
	if opened, err := store.Open(storePath); err != nil {
		fmt.Fprintf(os.Stderr, "cc-sidecar: store unavailable (%v), serving without persistence\n", err)
	} else {
		st = opened
		defer opened.Close()
	}

	policyJSON := ""
	if raw, err := os.ReadFile(policyPath); err != nil {
		fmt.Fprintf(os.Stderr, "cc-sidecar: policy unreadable (%v), /policy will 503\n", err)
	} else {
		policyJSON = string(raw)
	}

	api := NewServer(st, os.Getenv("CC_ADMIN_TOKEN"), policyJSON)
	api.Replayer = replayerFromEnv()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok","service":"cc-sidecar"}`)
	})
	mux.Handle("/api/", api.Handler())

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
