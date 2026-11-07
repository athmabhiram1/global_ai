package main

import (
	"context"
	"encoding/json"
	"strconv"
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
	// Full-content recording: the sidecar autopsy replays this payload, so
	// roles-only is not enough. keptIDs tag each tool message with its chunk.
	ctx.SetValue(pendingKey, pendingDecision{decision: d, request: recordedRequest(req, d.Kept)})
	// Decision-id correlation: the response-headers hook reads decisionIDKey
	// off the shared request-path root when it can, and the content-hash
	// registry (rememberDecision) when it cannot. Both are written here so
	// neither reader depends on the other's channel.
	ctx.SetValue(decisionIDKey, d.RequestID)
	rememberDecision(req, d.RequestID)
}

// recordedRequest keeps the replayable shape of the request: model, provider,
// and every message with its actual text. Each tool message that maps to a
// kept chunk carries that chunk's ID so autopsy can ablate by chunk_id.
//
// Mapping is positional and deterministic because Rewrite pairs kept[k] with
// the k-th tool message: when the tool count equals the kept count (the
// post-rewrite shape) the k-th tool message gets keptIDs[k]. Otherwise (the
// untouched annotate/block shape) the i-th tool message maps to input chunk
// c<i> when that chunk was kept.
func recordedRequest(req *schemas.BifrostRequest, keptIDs []string) string {
	type wireMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
		ChunkID string `json:"chunk_id,omitempty"`
	}
	out := map[string]any{"messages": []wireMsg{}}
	if req != nil && req.ChatRequest != nil {
		if req.ChatRequest.Model != "" {
			out["model"] = req.ChatRequest.Model
		}
		if req.ChatRequest.Provider != "" {
			out["provider"] = string(req.ChatRequest.Provider)
		}
		msgs := make([]wireMsg, 0, len(req.ChatRequest.Input))
		for _, m := range req.ChatRequest.Input {
			msgs = append(msgs, wireMsg{Role: string(m.Role), Content: messageText(m)})
		}
		toolPos := []int{}
		for i, m := range req.ChatRequest.Input {
			if m.Role == schemas.ChatMessageRoleTool {
				toolPos = append(toolPos, i)
			}
		}
		kept := map[string]bool{}
		for _, id := range keptIDs {
			kept[id] = true
		}
		for k, i := range toolPos {
			if len(keptIDs) == len(toolPos) {
				msgs[i].ChunkID = keptIDs[k]
			} else if id := "c" + strconv.Itoa(k); kept[id] {
				msgs[i].ChunkID = id
			}
		}
		out["messages"] = msgs
	}
	raw, _ := json.Marshal(out)
	return string(raw)
}

// redactedRequest keeps the message shape (roles, in order) and drops every
// byte of content. Kept for callers that need structure without prose; the
// autopsy path uses recordedRequest because replay needs the actual text.
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
