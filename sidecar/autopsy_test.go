// FROZEN — Wave 2 Task 2.6 sidecar autopsy tests. Do not edit without a plan amendment.
package main

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/athmabhiram/context-curator/plugin/model"
	"github.com/athmabhiram/context-curator/plugin/store"
)

type countingReplayer struct {
	calls   int
	with    string
	without string
}

func (f *countingReplayer) Replay(_ context.Context, _ string, dropChunk string) (string, error) {
	f.calls++
	if dropChunk == "" {
		return f.with, nil
	}
	return f.without, nil
}

func openAutopsyTestServer(t *testing.T, decision model.Decision, req string) *Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "autopsy.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := st.InsertDecision(context.Background(), decision, req); err != nil {
		t.Fatal(err)
	}
	return NewServer(st, "", "")
}

func keptDecision() model.Decision {
	return model.Decision{
		RequestID:  "req-1",
		ChunksIn:   2,
		ChunksKept: 1,
		Kept:       []string{"c1"},
		Dropped:    []model.DropReason{{ID: "c2", Reason: "stale"}},
	}
}

func TestAutopsyRejectsUnknownChunk(t *testing.T) {
	s := openAutopsyTestServer(t, keptDecision(), `{"messages":[]}`)
	s.Replayer = &countingReplayer{with: "answer a. second.", without: "answer b. second."}
	if _, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "cX"}); err == nil {
		t.Fatal("Autopsy unknown chunk: expected error, got nil")
	}
}

func TestAutopsyCachesResult(t *testing.T) {
	s := openAutopsyTestServer(t, keptDecision(), `{"messages":[]}`)
	fake := &countingReplayer{with: "The cat sits. It is sunny.", without: "The dog runs. It is sunny."}
	s.Replayer = fake
	req := AutopsyRequest{RequestID: "req-1", ChunkID: "c1"}
	first, err := s.Autopsy(context.Background(), req)
	if err != nil {
		t.Fatalf("first Autopsy: %v", err)
	}
	if first.Cached {
		t.Fatal("first Autopsy: Cached = true, want false")
	}
	second, err := s.Autopsy(context.Background(), req)
	if err != nil {
		t.Fatalf("second Autopsy: %v", err)
	}
	if !second.Cached {
		t.Fatal("second Autopsy: Cached = false, want true")
	}
	if fake.calls != 2 {
		t.Fatalf("replayer calls = %d, want 2 (one replay pair, second call cached)", fake.calls)
	}
}

func TestAutopsyInfluenceInRange(t *testing.T) {
	s := openAutopsyTestServer(t, keptDecision(), `{"messages":[]}`)
	s.Replayer = &countingReplayer{with: "The cat sits. It is sunny.", without: "The dog runs. It is sunny."}
	res, err := s.Autopsy(context.Background(), AutopsyRequest{RequestID: "req-1", ChunkID: "c1"})
	if err != nil {
		t.Fatalf("Autopsy: %v", err)
	}
	if res.Influence < 0 || res.Influence > 1 {
		t.Fatalf("influence = %v, want in [0,1]", res.Influence)
	}
}
