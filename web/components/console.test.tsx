// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ChunkCard, DecisionDrawerView } from "./console/Drawer";
import { AutopsyResultView } from "./console/Autopsy";
import AutopsySection from "./console/AutopsySection";
import { ModeSeg, PolicyView } from "./console/Policy";
import SourcesSection, { SourcesTable } from "./console/Sources";
import { api } from "../lib/api";
import {
  autopsyFixture,
  chunkRecordFixture,
  decisionDetailFixture,
  decisionListItemFixture,
  decisionRowFixture,
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

describe("Template parity: drawer flame groups", () => {
  it("groups lanes under parents scaled to the parent span", () => {
    render(
      <DecisionDrawerView detail={decisionDetailFixture} onAutopsy={() => {}} />,
    );
    const groups = document.querySelectorAll(".flame .fgrp");
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const parent = document.querySelector(
      ".flame .fgrp .frow.parent .fbar",
    ) as HTMLElement;
    expect(parent.style.width).toBe("100%");
    expect(
      document.querySelector(".flame")?.textContent,
    ).toContain("PreRequestHook");
  });
});

describe("Template parity: drawer chunk + claim copy", () => {
  it("prefixes drop reasons with 'reason:'", () => {
    render(
      <ChunkCard
        chunk={{ id: "c3", dom: "blog.example.com", verdict: "drop", reason: "stale" }}
        onAutopsy={() => {}}
      />,
    );
    expect(screen.getByText(/reason: stale/)).toBeTruthy();
  });

  it("leaves the score blank when the sidecar sent none", () => {
    render(
      <ChunkCard
        chunk={{ id: "c9", dom: "c9", verdict: "keep" }}
        onAutopsy={() => {}}
      />,
    );
    expect(
      document.querySelector('[data-testid="chunk-c9"] .sc')?.textContent,
    ).toBe("");
  });

  it("labels the claim panel FR-9 off-path", () => {
    render(
      <DecisionDrawerView
        detail={{
          ...decisionDetailFixture,
          claims: [
            {
              text: "Acme Pro costs $49 per seat.",
              source: "c1",
              freshness: 0.9,
              evidence: ["docs.example.com"],
            },
          ],
        }}
        onAutopsy={() => {}}
      />,
    );
    expect(document.querySelector(".d-sec h4")?.textContent).toContain(
      "Decision",
    );
    expect(screen.getByText(/FR-9 · off-path/).textContent).not.toContain(
      "sidecar",
    );
  });
});

describe("Template parity: sources table", () => {
  it("renders the explainer row above the table", () => {
    render(<SourcesSection rows={[repItemFixture]} onChanged={() => {}} />);
    const expl = document.querySelector(".expl");
    expect(expl).toBeTruthy();
    expect(expl!.querySelectorAll(".ex").length).toBe(3);
  });

  it("uses the 5-column template header and α/β + ratio utility copy", () => {
    render(
      <SourcesTable
        rows={[repItemFixture]}
        onGood={() => {}}
        onBad={() => {}}
        onDeny={() => {}}
        onReset={() => {}}
      />,
    );
    const head = document.querySelector(".rhead")!;
    expect(head.children.length).toBe(5);
    expect(head.textContent).toContain("Learned in");
    expect(document.querySelector(".rrow .ab")?.textContent).toContain("α");
    expect(document.querySelector(".rrow .ab")?.textContent).toContain("β");
    expect(document.querySelector(".rrow .upct")?.textContent).toBe("0.70");
  });

  it("deny toggles: an already-denied domain posts denied=false", async () => {
    const { fetchFn, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ Domain: "x", Denied: false }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const onChanged = vi.fn();
    render(
      <SourcesSection
        rows={[{ ...repItemFixture, denied: true }]}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByTestId(`deny-${repItemFixture.domain}`));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      domain: repItemFixture.domain,
      denied: false,
    });
  });
});

describe("Template parity: autopsy proof honesty", () => {
  it("derives replay log lines strictly from the result (no invented transport)", () => {
    render(<AutopsyResultView result={autopsyFixture} chunkId="c1" requestId="rq-1" />);
    const log = document.querySelector("#aut-log")!.textContent!;
    expect(log).toContain("rq-1");
    expect(log).toContain("c1");
    expect(log).not.toContain("sqlite ok");
    expect(log).not.toContain("200");
    expect(log).toContain("0.25");
  });

  it("tags with-side sentences with the chunk and without-side as corrected", () => {
    const both = {
      ...autopsyFixture,
      without_sentences: [
        "Acme Pro costs $49 per seat.",
        "Metered billing shipped.",
      ],
    };
    render(<AutopsyResultView result={both} chunkId="c1" />);
    expect(document.querySelector("#aut-with-h")!.textContent!).toContain("c1");
    expect(document.querySelector("#aut-without-h")!.textContent!).toContain(
      "c1",
    );
    const tags = [...document.querySelectorAll(".mtag")].map(
      (el) => el.textContent,
    );
    expect(tags.some((t) => t?.includes("c1"))).toBe(true);
    expect(tags).toContain("corrected");
  });

  it("highlights the chunk id inside the quote", () => {
    render(
      <AutopsyResultView
        result={{
          ...autopsyFixture,
          quote: "It wasn't the model. It was chunk c1.",
        }}
        chunkId="c1"
      />,
    );
    expect(document.querySelector("#aut-quote em")?.textContent).toBe("c1");
  });

  it("shows the API verbatim error for dropped chunks, never a fake replay", async () => {
    const { fetchFn } = stubFetch((url) =>
      url.endsWith("/api/cc/api/context-curator/autopsy")
        ? new Response("chunk c3 was not retained", { status: 422 })
        : new Response(JSON.stringify([decisionRowFixture]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const rows = [
      {
        ...decisionListItemFixture,
        id: "rq-1",
        _raw: decisionRowFixture,
        _live: true as const,
      },
    ];
    render(<AutopsySection rows={rows} />);
    await waitFor(() =>
      expect(screen.queryByTestId("ablate-c3")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("ablate-c3"));
    fireEvent.click(screen.getByTestId("autopsy-run"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("not retained"),
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "Replay is unavailable",
    );
    expect(document.querySelectorAll("#aut-influence").length).toBeLessThanOrEqual(1);
  });
});

describe("Template parity: policy hookstrip", () => {
  it("matches the template hook order with PreRequest current", () => {
    render(
      <PolicyView
        mode="rewrite"
        summary={{ effective_mode: "rewrite" }}
        raw="mode: rewrite"
        denied={[]}
        onMode={() => {}}
      />,
    );
    const strip = document.querySelector(".hookstrip")!.textContent!;
    expect(strip).toContain("PreRequest");
    expect(strip).toContain("x-cc-decision-id");
    expect(strip).not.toContain("curator");
  });
});
