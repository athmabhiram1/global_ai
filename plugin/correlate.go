package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/maximhq/bifrost/core/schemas"
)

// Transport hooks (HTTPTransportPreHook, HTTPTransportResponseHeadersHook)
// and core hooks (PreRequestHook, PostLLMHook) run on different
// *BifrostContext roots: the transport middleware mints its own root per
// request, and the inference handler converts another one. No ctx value set
// in one family is visible in the other — verified against
// transports/bifrost-http/handlers/middlewares.go (getBifrostContextFromFastHTTP)
// and handlers/inference.go (ConvertToBifrostContext).
//
// This registry is the side-channel that survives: both families see the
// same message bytes, so they agree on a content hash. Bypass marks and
// decision ids are keyed by that hash. The map is bounded (FIFO eviction)
// and every method degrades to "unknown" instead of failing the request.

const correlateMaxEntries = 1024

var (
	correlateMu   sync.Mutex
	correlateDec  = map[string]string{}
	correlateOrd  = []string{}
	correlateByp  = map[string]time.Time{}
	correlateBypO = []string{}
)

// hashMessages reduces an ordered role/text transcript to a hex digest.
// Model names are deliberately excluded: the same content bypasses and
// correlates the same way whatever alias routed it.
func hashMessages(msgs []wireMsg) string {
	var b strings.Builder
	for _, m := range msgs {
		b.WriteString(m.Role)
		b.WriteString("\n")
		b.WriteString(m.Content)
		b.WriteString("\n")
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

type wireMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// transcriptOfRequest renders the core request the same way recordedRequest
// stores it: ordered role/text pairs.
func transcriptOfRequest(req *schemas.BifrostRequest) []wireMsg {
	out := []wireMsg{}
	if req == nil || req.ChatRequest == nil {
		return out
	}
	for _, m := range req.ChatRequest.Input {
		out = append(out, wireMsg{Role: string(m.Role), Content: messageText(m)})
	}
	return out
}

// transcriptOfBody parses the raw client JSON the transport hook sees.
// Content may be a string, a parts array ([{"text": ...}]), or absent.
// Unparseable bodies yield no transcript (graceful unknown), never an error.
func transcriptOfBody(body []byte) []wireMsg {
	out := []wireMsg{}
	if len(bytes.TrimSpace(body)) == 0 {
		return out
	}
	var payload struct {
		Messages []struct {
			Role    string          `json:"role"`
			Content json.RawMessage `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return out
	}
	for _, m := range payload.Messages {
		out = append(out, wireMsg{Role: m.Role, Content: flattenContent(m.Content)})
	}
	return out
}

// flattenContent reads either content shape the gateway accepts.
func flattenContent(raw json.RawMessage) string {
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var parts []struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parts); err == nil {
		var b strings.Builder
		for _, p := range parts {
			b.WriteString(p.Text)
		}
		return b.String()
	}
	return ""
}

func rememberDecision(req *schemas.BifrostRequest, id string) {
	if id == "" {
		return
	}
	h := hashMessages(transcriptOfRequest(req))
	if h == "" {
		return
	}
	rememberDecisionHash(h, id)
}

// rememberDecisionHash records a decision id under an explicit transcript
// hash. The pipeline uses this with the pre-rewrite transcript: Rewrite
// mutates the request in place before stashPending runs, so hashing the
// mutated request would key the registry by bytes the client never sent and
// the response hook could never match them.
func rememberDecisionHash(h, id string) {
	if h == "" || id == "" {
		return
	}
	correlateMu.Lock()
	defer correlateMu.Unlock()
	if _, ok := correlateDec[h]; !ok {
		correlateOrd = append(correlateOrd, h)
	}
	correlateDec[h] = id
	for len(correlateOrd) > correlateMaxEntries {
		delete(correlateDec, correlateOrd[0])
		correlateOrd = correlateOrd[1:]
	}
}

func lookupDecisionByBody(body []byte) (string, bool) {
	msgs := transcriptOfBody(body)
	if len(msgs) == 0 {
		return "", false
	}
	correlateMu.Lock()
	defer correlateMu.Unlock()
	id, ok := correlateDec[hashMessages(msgs)]
	return id, ok
}

// Bypass marks are single-use with a short TTL. The mark must not linger:
// an identical live request arriving after a replay would otherwise skip
// curation silently — a trust hole. The replay consumes its mark on arrival
// (PreRequestHook runs exactly once per request, so one consumption is
// exact); unclaimed marks expire so a dropped replay cannot poison later
// traffic. Residual risk is a live twin landing between a replay's mark and
// its arrival — a seconds-wide window the sequential autopsy caller owns.
var bypassTTL = 60 * time.Second

func markBypassHash(h string) {
	if h == "" {
		return
	}
	correlateMu.Lock()
	defer correlateMu.Unlock()
	if _, ok := correlateByp[h]; !ok {
		correlateBypO = append(correlateBypO, h)
	}
	correlateByp[h] = time.Now()
	for len(correlateBypO) > correlateMaxEntries {
		delete(correlateByp, correlateBypO[0])
		correlateBypO = correlateBypO[1:]
	}
}

// consumeBypassHash reports and consumes a live bypass mark. Expired marks
// are treated as absent and swept.
func consumeBypassHash(h string) bool {
	if h == "" {
		return false
	}
	correlateMu.Lock()
	defer correlateMu.Unlock()
	stamped, ok := correlateByp[h]
	if !ok {
		return false
	}
	delete(correlateByp, h)
	for i, k := range correlateBypO {
		if k == h {
			correlateBypO = append(correlateBypO[:i], correlateBypO[i+1:]...)
			break
		}
	}
	return time.Since(stamped) <= bypassTTL
}

func bypassHashKnown(h string) bool {
	return consumeBypassHash(h)
}

// clearCorrelate resets the registry. Tests only.
func clearCorrelate() {
	correlateMu.Lock()
	defer correlateMu.Unlock()
	correlateDec = map[string]string{}
	correlateOrd = []string{}
	correlateByp = map[string]time.Time{}
	correlateBypO = []string{}
}
