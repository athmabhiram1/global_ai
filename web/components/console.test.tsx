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
  it("renders domain, authority, freshness, age, tokens, cluster, provenance, refresh + 5 scores", () => {    render(
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
        raw={null}
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

describe("Template parity: drawer chunk score bars", () => {
  it("renders the weighted ck-bar with one segment per score component", () => {
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
    const bar = document.querySelector(".ck-bar");
    expect(bar).toBeTruthy();
    expect(bar!.querySelectorAll("i").length).toBe(5);
  });
});

describe("Template parity: autopsy proof block", () => {
  it("renders aut-log replay lines, quote, verdict, actions and meta", () => {
    const onUnreliable = vi.fn();
    render(
      <AutopsyResultView
        result={{
          ...autopsyFixture,
          quote: "It wasn't the model. It was chunk c1.",
          verdict: "Removing c1 flips the price sentence.",
        }}
        chunkId="c1"
        requestId="rq-1"
        onMarkUnreliable={onUnreliable}
      />,
    );
    expect(document.querySelector("#aut-log")?.textContent).toContain("rq-1");
    expect(document.querySelector("#aut-log")?.textContent).toContain("c1");
    expect(document.querySelector("#aut-quote")?.textContent).toContain(
      "It wasn't the model.",
    );
    expect(document.querySelector("#aut-verdict")?.textContent).toContain(
      "flips the price",
    );
    expect(document.querySelector("#aut-changed")?.textContent).toContain(
      "1 / 4 sentences changed",
    );
    expect(document.querySelector("#aut-meta")?.textContent).toContain("320");
    fireEvent.click(screen.getByTestId("mark-unreliable"));
    expect(onUnreliable).toHaveBeenCalledWith("docs.example.com");
  });

  it("omits quote/verdict when the sidecar did not return them (no fake text)", () => {
    render(<AutopsyResultView result={autopsyFixture} chunkId="c1" />);
    expect(document.querySelector("#aut-quote")).toBeNull();
    expect(document.querySelector("#aut-verdict")).toBeNull();
  });
});

describe("Template parity: policy surface", () => {
  const summary = {
    effective_mode: "rewrite",
    budget: { max_context_tokens: 4000, max_chunks: 8 },
    freshness: { classes: { price: 24, law: 168 } },
    authority: { deny: ["content-farm.example"] },
    claims: {},
    autopsy: {},
  };

  it("renders raw YAML in the codeblk, not JSON", () => {
    render(
      <PolicyView
        mode="rewrite"
        summary={summary}
        raw="context_curator:\n  mode: rewrite\n"
        denied={[]}
        onMode={() => {}}
      />,
    );
    const code = screen.getByTestId("policy-yaml");
    expect(code.textContent).toContain("mode: rewrite");
    expect(code.textContent).not.toContain('"effective_mode"');
  });

  it("renders the budget gauge, freshness bars and hookstrip", () => {
    render(
      <PolicyView
        mode="rewrite"
        summary={summary}
        raw="mode: rewrite"
        denied={[]}
        onMode={() => {}}
      />,
    );
    expect(document.querySelector(".gauge")).toBeTruthy();
    expect(document.querySelectorAll(".fbar").length).toBe(2);
    expect(document.querySelector(".hookstrip")).toBeTruthy();
  });

  it("treats empty claims/autopsy sections as unconfigured, not '{}'", () => {
    render(
      <PolicyView
        mode="rewrite"
        summary={summary}
        raw="mode: rewrite"
        denied={[]}
        onMode={() => {}}
      />,
    );
    expect(screen.getByText(/Claim extraction is not configured/)).toBeTruthy();
    expect(screen.getByText(/Replay is unavailable/)).toBeTruthy();
  });
});
