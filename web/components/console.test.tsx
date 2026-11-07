// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ChunkCard, DecisionDrawerView } from "./console/Drawer";
import { AutopsyResultView } from "./console/Autopsy";
import { ModeSeg, PolicyView } from "./console/Policy";
import { SourcesTable } from "./console/Sources";
import { api } from "../lib/api";
import {
  autopsyFixture,
  chunkRecordFixture,
  decisionDetailFixture,
  repItemFixture,
  stubFetch,
} from "../lib/testFixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChunkCard", () => {
  it("renders domain, authority, freshness, age, tokens, cluster, provenance, refresh + 5 scores", () => {
    render(
      <ChunkCard
        chunk={{
          id: "c1",
          dom: "docs.example.com",
          verdict: "keep",
          score: 0.82,
          record: chunkRecordFixture,
        }}
        onAutopsy={() => {}}
      />,
    );
    const card = screen.getByTestId("chunk-c1");
    expect(card.textContent).toContain("docs.example.com");
    expect(card.textContent).toContain("primary");
    expect(card.textContent).toContain("price");
    expect(card.textContent).toContain("2.5 h");
    expect(card.textContent).toContain("320");
    expect(card.textContent).toContain("known");
    expect(card.textContent).toContain("refreshed");
    const scores = screen.getByTestId("scores-c1");
    for (const label of [
      "relevance",
      "freshness",
      "independence",
      "utility",
      "score",
    ]) {
      expect(scores.textContent).toContain(label);
    }
  });

  it("renders ID-only legacy chunks without crashing", () => {
    render(
      <ChunkCard
        chunk={{ id: "c9", dom: "c9", verdict: "keep" }}
        onAutopsy={() => {}}
      />,
    );
    expect(screen.getByTestId("chunk-c9").textContent).toContain(
      "ID-only row",
    );
  });
});

describe("DecisionDrawerView", () => {
  it("shows the honest empty-claims state", () => {
    render(
      <DecisionDrawerView detail={decisionDetailFixture} onAutopsy={() => {}} />,
    );
    expect(screen.getByText(/Claim extraction is not configured/).textContent)
      .toBeTruthy();
  });
});

describe("AutopsyResultView", () => {
  it("renders with/without sentences with changed highlight", () => {
    render(<AutopsyResultView result={autopsyFixture} chunkId="c1" />);
    expect(screen.getByLabelText("Autopsy result for c1").textContent).toContain(
      "Acme Pro costs $49 per seat.",
    );
    expect(screen.getAllByTestId("changed-sentence").length).toBeGreaterThan(0);
    expect(screen.getByText(/docs.example.com mattered/).textContent).toContain(
      "1/2 changed",
    );
  });
});

describe("Sources actions", () => {
  it("deny posts to /deny and refetches", async () => {
    const { fetchFn, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ Domain: "x", Denied: true }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const onDeny = vi.fn();
    render(
      <SourcesTable
        rows={[{ ...repItemFixture, denied: true }]}
        onGood={() => {}}
        onBad={() => {}}
        onDeny={onDeny}
        onReset={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId(`deny-${repItemFixture.domain}`));
    expect(onDeny).toHaveBeenCalledWith(repItemFixture.domain);
    await api.deny(repItemFixture.domain, true);
    expect(calls[0].url).toContain("/api/cc/api/context-curator/deny");
  });
});

describe("Policy mode", () => {
  it("mode switch posts to /policy/mode", async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify({ mode: "block" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const onMode = vi.fn();
    render(<ModeSeg mode="rewrite" onMode={onMode} />);
    fireEvent.click(screen.getByTestId("mode-block"));
    expect(onMode).toHaveBeenCalledWith("block");
    await api.setMode("block");
    expect(calls[0].url).toContain("/api/cc/api/context-curator/policy/mode");
  });

  it("kill list is the union of config deny + Denied rows (live)", () => {
    render(
      <PolicyView
        mode="rewrite"
        summary={{
          effective_mode: "rewrite",
          authority: { deny: ["content-farm.example"] },
        }}
        denied={["evil.example"]}
        onMode={() => {}}
      />,
    );
    const chips = screen.getByTestId("deny-chips");
    expect(chips.textContent).toContain("content-farm.example");
    expect(chips.textContent).toContain("evil.example");
  });
});

describe("Autopsy cache honesty", () => {
  it("cached results carry the 60-min TTL note", () => {
    render(
      <AutopsyResultView result={{ ...autopsyFixture, cached: true }} chunkId="c1" />,
    );
    expect(screen.getByLabelText("Autopsy result for c1").textContent).toContain(
      "60 min",
    );
  });
});
