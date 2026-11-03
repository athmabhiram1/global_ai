// FROZEN — DO NOT EDIT. Task 2.1 recorder acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
	"github.com/athmabhiram/context-curator/plugin/store"
	"github.com/maximhq/bifrost/core/schemas"
)

func testContext() *schemas.BifrostContext {
	return schemas.NewBifrostContext(context.Background(), time.Now().Add(time.Minute))
}

func withStore(t *testing.T, s *store.Store) {
	t.Helper()
	old := activeStore
	activeStore = s
	t.Cleanup(func() { activeStore = old })
}

func TestPostLLMHookPersistsDecision(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	withStore(t, s)
	ctx := testContext()
	p := &pipeline{cfg: DefaultConfig()}
	d, err := p.handle(ctx, toolRequest("alpha https://a.example.com/x", "beta", "gamma"))
	if err != nil {
		t.Fatal(err)
	}
	resp := &schemas.BifrostResponse{}
	out, outErr, err := PostLLMHook(ctx, resp, nil)
	if err != nil || out != resp || outErr != nil {
		t.Fatalf("PostLLMHook = (%v, %v, %v), want passthrough", out, outErr, err)
	}
	var got model.Decision
	got, _, err = s.GetDecision(context.Background(), d.RequestID)
	if err != nil {
		t.Fatalf("decision %q not persisted: %v", d.RequestID, err)
	}
	if got.ChunksIn != 3 || got.ChunksKept != 3 {
		t.Fatalf("persisted = %+v", got)
	}
}

func TestPostLLMHookNoPendingPassthrough(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	withStore(t, s)
	resp := &schemas.BifrostResponse{}
	out, outErr, err := PostLLMHook(testContext(), resp, nil)
	if err != nil || out != resp || outErr != nil {
		t.Fatal("hook without a stashed decision must pass through untouched")
	}
}

func TestPostLLMHookNoStoreNeverFails(t *testing.T) {
	oldStore, oldCfg := activeStore, activeConfig
	activeStore = nil
	activeConfig = &Config{Store: filepath.Join(t.TempDir(), "missing-dir", "deep", "t.db")}
	t.Cleanup(func() { activeStore, activeConfig = oldStore, oldCfg })
	ctx := testContext()
	p := &pipeline{cfg: DefaultConfig()}
	if _, err := p.handle(ctx, toolRequest("alpha")); err != nil {
		t.Fatal(err)
	}
	resp := &schemas.BifrostResponse{}
	// Unwritable store path: persistence degrades, the response still flows.
	if _, _, err := PostLLMHook(ctx, resp, nil); err != nil {
		t.Fatalf("PostLLMHook = %v, want nil (degrade, never block)", err)
	}
}
