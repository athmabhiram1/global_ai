// Package main builds the Context Curator Bifrost plugin as a Go shared object.
//
// Bifrost loads this file with plugin.Open, so every exported symbol below is
// looked up by name. The required surface is GetName and Cleanup; the hooks are
// optional and are only wired when the symbol exists.
package main

import (
	"github.com/maximhq/bifrost/core/schemas"
)

const pluginName = "context-curator"

// activeConfig holds the validated startup config for the hook path.
var activeConfig *Config

// Init receives the plugin's "config" block from config.json.
func Init(config any) error {
	cfg, err := ParseConfig(config)
	if err != nil {
		return err
	}
	activeConfig = cfg
	return nil
}

// GetName is the system identifier. Users cannot rename it.
func GetName() string { return pluginName }

// Cleanup releases anything Init allocated.
func Cleanup() error { return nil }

// PreRequestHook runs exactly once per top-level request, before routing and
// before any fallback attempt. Mutations made here are committed to the shared
// request and observed by the provider call and by every fallback. Hook
// errors are non-blocking: the core logs them and the request continues
// uncurated, so admission can never break the gateway.
func PreRequestHook(ctx *schemas.BifrostContext, req *schemas.BifrostRequest) error {
	if spikeEnabled() {
		spikeRewrite(req)
		return nil
	}
	if activeConfig == nil {
		return nil
	}
	_, err := newPipeline(activeConfig).handle(ctx, req)
	return err
}

// PostLLMHook runs once per provider attempt, in reverse registration order.
func PostLLMHook(
	ctx *schemas.BifrostContext,
	resp *schemas.BifrostResponse,
	bifrostErr *schemas.BifrostError,
) (*schemas.BifrostResponse, *schemas.BifrostError, error) {
	return resp, bifrostErr, nil
}
