package main

import (
	"strings"

	"github.com/maximhq/bifrost/core/schemas"
)

// Bypass lets the sidecar replay a recorded request without re-curation.
// The replayer sends `x-cc-bypass: 1`; HTTPTransportPreHook observes the raw
// HTTP headers and marks the request, and PreRequestHook honours the mark.
//
// Marks travel two channels, because transport hooks and core hooks run on
// different *BifrostContext roots (see correlate.go) and share no values:
// the ctx flag covers the case where they ever share a root, and the
// content-hash registry covers production. Either channel suffices.

type bypassKeyType string

const bypassKey bypassKeyType = "cc-bypass"

// decisionIDKeyType carries the persisted decision id from stashPending to
// PostLLMHook on the core request context.
type decisionIDKeyType string

const decisionIDKey decisionIDKeyType = "cc-decision-id"

// shouldBypass reports whether this request must skip curation. A nil
// context never bypasses: fail closed toward curating.
func shouldBypass(ctx *schemas.BifrostContext) bool {
	if ctx == nil {
		return false
	}
	v, _ := ctx.Value(bypassKey).(bool)
	return v
}

// shouldBypassHash reports whether the request's content was marked for
// bypass by the transport hook. This is the production channel: it needs no
// shared context, only identical message bytes on both sides.
func shouldBypassHash(req *schemas.BifrostRequest) bool {
	if req == nil {
		return false
	}
	return bypassHashKnown(hashMessages(transcriptOfRequest(req)))
}

// markBypass flags the request context to skip curation.
func markBypass(ctx *schemas.BifrostContext) {
	if ctx == nil {
		return
	}
	ctx.SetValue(bypassKey, true)
}

// HTTPTransportPreHook marks bypass requests before they enter core. It never
// short-circuits and never fails the request: any error degrades to curating.
func HTTPTransportPreHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest) (*schemas.HTTPResponse, error) {
	if ctx == nil || req == nil {
		return nil, nil
	}
	for k, v := range req.Headers {
		if strings.EqualFold(k, "x-cc-bypass") && strings.TrimSpace(v) == "1" {
			markBypass(ctx)
			h := hashMessages(transcriptOfBody(req.Body))
			markBypassHash(h)
			break
		}
	}
	return nil, nil
}

// HTTPTransportResponseHeadersHook correlates the response with its decision
// record. The decision id is looked up by request content hash (see
// correlate.go): the header hook's context shares nothing with the core
// pipeline's, so a ctx value would never arrive. When unknown — bypassed,
// non-chat, unparseable — no header is added. It never fails the request.
//
// The id is also appended to Access-Control-Expose-Headers when that list is
// already present, so the browser console (cross-origin :8090 → :8080) can
// read it. An absent list is left alone: inventing CORS policy is not this
// hook's job.
func HTTPTransportResponseHeadersHook(ctx *schemas.BifrostContext, req *schemas.HTTPRequest, resp *schemas.HTTPResponseMetadata) error {
	if req == nil || resp == nil {
		return nil
	}
	// Bypassed replays were never curated: attaching a content-matched id
	// from an earlier curated twin would misattribute the decision.
	for k, v := range req.Headers {
		if strings.EqualFold(k, "x-cc-bypass") && strings.TrimSpace(v) == "1" {
			return nil
		}
	}
	id := ""
	if ctx != nil {
		id, _ = ctx.Value(decisionIDKey).(string)
	}
	if id == "" {
		var ok bool
		id, ok = lookupDecisionByBody(req.Body)
		if !ok {
			return nil
		}
	}
	resp.SetHeader("x-cc-decision-id", id)
	expose := resp.Header("Access-Control-Expose-Headers")
	if expose != "" && !strings.Contains(strings.ToLower(expose), "x-cc-decision-id") {
		resp.SetHeader("Access-Control-Expose-Headers", expose+", x-cc-decision-id")
	}
	return nil
}
