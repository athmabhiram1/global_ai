package main

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/athmabhiram/context-curator/plugin/store"
	"github.com/maximhq/bifrost/core/schemas"
)

// pendingKey carries the admission decision from PreRequestHook to
// PostLLMHook on the request context. The response itself stays untouched:
// decisions live in SQLite, correlated by x-cc-decision-id.
type ctxKey string

const pendingKey ctxKey = "cc-pending-decision"

type pendingDecision struct {
	decision Decision
	request  string
}

// activeStore is the persistence backend. Tests wire a temp-dir store
// directly; production lazily opens the configured path on first use.
var (
	activeStore   *store.Store
	activeStoreMu sync.Mutex
)

func storeForPersist() *store.Store {
	activeStoreMu.Lock()
	defer activeStoreMu.Unlock()
	if activeStore != nil {
		return activeStore
	}
	if activeConfig == nil || activeConfig.Store == "" {
		return nil
	}
	s, err := store.Open(activeConfig.Store)
	if err != nil {
		return nil
	}
	activeStore = s
	return activeStore
}

func stashPending(ctx *schemas.BifrostContext, d Decision, req *schemas.BifrostRequest) {
	if ctx == nil {
		return
	}
	ctx.SetValue(pendingKey, pendingDecision{decision: d, request: redactedRequest(req)})
}

// redactedRequest keeps the message shape (roles, in order) and drops every
// byte of content. Replay uses it to rebuild structure, never prose.
func redactedRequest(req *schemas.BifrostRequest) string {
	roles := []string{}
	if req != nil && req.ChatRequest != nil {
		for _, m := range req.ChatRequest.Input {
			roles = append(roles, string(m.Role))
		}
	}
	raw, _ := json.Marshal(map[string]any{"roles": roles})
	return string(raw)
}

// PostLLMHook persists the stashed decision, then passes the response
// through untouched. Persistence never fails the request: no store, no
// pending decision, or a write error all degrade to a plain passthrough.
func PostLLMHook(
	ctx *schemas.BifrostContext,
	resp *schemas.BifrostResponse,
	bifrostErr *schemas.BifrostError,
) (*schemas.BifrostResponse, *schemas.BifrostError, error) {
	if ctx != nil {
		if pd, ok := ctx.Value(pendingKey).(pendingDecision); ok {
			if s := storeForPersist(); s != nil {
				_ = s.InsertDecision(context.Background(), pd.decision, pd.request)
			}
		}
	}
	return resp, bifrostErr, nil
}
