package main

import (
	"testing"
)

// New coverage, not frozen: bypass + panic recovery + decision-id header.
// RED first: these fail until the production code lands.

func TestBypassHeaderSkipsCuration(t *testing.T) {
	ctx := testContext()
	markBypass(ctx)
	if !shouldBypass(ctx) {
		t.Fatal("marked bypass context must skip curation")
	}
	if shouldBypass(testContext()) {
		t.Fatal("request without bypass must not skip")
	}
	if shouldBypass(nil) {
		t.Fatal("nil context must not skip")
	}
}

func TestPreRequestHookRecoversFromPanic(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("PreRequestHook panicked: %v", r)
		}
	}()
	// nil request must not panic; hook degrades to passthrough.
	if err := PreRequestHook(testContext(), nil); err != nil {
		t.Fatalf("nil request should pass through, got %v", err)
	}
}

func TestDecisionIDHeaderHookExists(t *testing.T) {
	// The header hook must exist so responses correlate via x-cc-decision-id.
	// It must not panic on nils.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("HTTPTransportResponseHeadersHook panicked: %v", r)
		}
	}()
	_ = HTTPTransportResponseHeadersHook(nil, nil, nil)
}
