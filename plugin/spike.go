package main

// Wave 0.3 spike. This file exists to answer one question with evidence rather
// than documentation: does a PreRequestHook mutation to ChatRequest.Input reach
// the provider, and does it survive a fallback attempt?
//
// It is gated on CC_SPIKE_MARKER. With the variable unset the plugin is a no-op.
// Delete this file once Task 0.3 is recorded as passing.

import (
	"os"

	"github.com/maximhq/bifrost/core/schemas"
)

const spikeEnvVar = "CC_SPIKE_MARKER"

func spikeEnabled() bool { return os.Getenv(spikeEnvVar) != "" }

// spikeRewrite prefixes every message's text with the configured marker.
func spikeRewrite(req *schemas.BifrostRequest) {
	if req == nil || req.ChatRequest == nil {
		return
	}
	marker := os.Getenv(spikeEnvVar)
	if marker == "" {
		return
	}

	msgs := req.ChatRequest.Input
	for i := range msgs {
		text := messageText(msgs[i])
		msgs[i].Content = &schemas.ChatMessageContent{
			ContentStr: ptr(marker + "|" + text),
		}
	}
	req.ChatRequest.Input = msgs
}
