// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import Shell from "./console/Shell";
import { autopsyFixture, decisionRowFixture } from "../lib/testFixtures";

vi.mock("./console/Evals", () => ({
  default: () => <p>mocked evals section</p>,
}));

vi.mock("./console/Playground", () => ({
  default: () => <p>mocked playground section</p>,
}));

function decisionsPayload() {
  return [
    { ...decisionRowFixture, request_id: "rq-1", policy: "support-bot" },
    { ...decisionRowFixture, request_id: "rq-2", policy: "docs/default" },
  ];
}

function stubApi(opts: { failDecisions?: boolean } = {}) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    if (url.includes("/decisions/rq-")) {
      return new Response(JSON.stringify({ ...decisionRowFixture, request_id: "rq-1" }), { status: 200 });
    }
    if (url.includes("/autopsy")) {
      return new Response(JSON.stringify(autopsyFixture), { status: 200 });
    }
    if (url.includes("/decisions")) {
      if (opts.failDecisions) return new Response("down", { status: 500 });
      return new Response(JSON.stringify(decisionsPayload()), { status: 200 });
    }
    if (url.includes("/reputation")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes("/policy")) {
      return new Response(JSON.stringify({ mode: "rewrite" }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  vi.stubGlobal("fetch", fn as typeof fetch);
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/console");
});

describe("console shell template parity", () => {
  it("topbar: crumb context-curator + pg label, Tour btn, sim-badge, ⌘K", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    const crumb = document.querySelector(".crumb");
    expect(crumb?.textContent).toMatch(/context-curator/);
    expect(document.getElementById("top-crumb")).toBeTruthy();
    // Tour button (stable selector for tour agent)
    const tour = document.querySelector('[data-testid="tour-open"]');
    expect(tour).toBeTruthy();
    expect(tour?.textContent).toMatch(/Tour/);
    // sim-badge LIVE state
    const badge = document.getElementById("sim-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toMatch(/LIVE/i);
    // ⌘K button
    const k = document.getElementById("btn-k");
    expect(k).toBeTruthy();
    expect(k?.textContent).toMatch(/⌘K/);
  });

  it("sidebar .side with .sitem svg icons, .cur tracking, guided tour + front page", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    const side = document.querySelector("aside.side");
    expect(side).toBeTruthy();
    expect(side?.querySelector(".side-label")?.textContent).toMatch(/Console/);
    for (const p of ["traces", "autopsy", "sources", "policy"]) {
      const btn = side!.querySelector(`.sitem[data-page="${p}"]`);
      expect(btn, p).toBeTruthy();
      expect(btn!.querySelector("svg"), `${p} icon`).toBeTruthy();
    }
    expect(document.querySelector(".sitem.cur")).toBeTruthy();
    // Guided tour (sp2) + Front page entries
    const sp2 = side!.querySelector(".sitem.sp2");
    expect(sp2?.textContent).toMatch(/Guided tour/);
    const items = [...side!.querySelectorAll(".sitem")].map((b) => b.textContent);
    expect(items.join(" ")).toMatch(/Front page/);
    expect(document.querySelector(".side-sp")).toBeTruthy();
  });

  it("sections pv-traces/pv-autopsy/pv-sources/pv-policy with pv-head h2/why/keyline + .on", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    for (const p of ["traces", "autopsy", "sources", "policy"]) {
      const sec = document.getElementById(`pv-${p}`);
      expect(sec, p).toBeTruthy();
      expect(sec!.querySelector(".pv-head h2")).toBeTruthy();
      expect(sec!.querySelector(".pv-head .why")).toBeTruthy();
    }
    expect(document.querySelector("#pv-traces .keyline")).toBeTruthy();
    // default active section
    expect(document.getElementById("pv-traces")?.classList.contains("on")).toBe(true);
  });

  it("scope filters client-side without refetch", async () => {
    const calls = stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    const decisionCalls = () => calls.filter((u) => u.includes("/decisions") && !u.includes("/decisions/rq-")).length;
    fireEvent.click(document.getElementById("scope-btn")!);
    fireEvent.click(screen.getByRole("option", { name: /docs\/default/ }));
    const before = decisionCalls();
    await waitFor(() => expect(document.querySelector('.trow[data-id="rq-1"]')).toBeNull());
    expect(document.querySelector('.trow[data-id="rq-2"]')).toBeTruthy();
    // scope filter is client-side: filtering must not trigger a refetch
    expect(decisionCalls()).toBe(before);
  });

  it("row click and Enter open the drawer hook (?decision= set)", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    const row = document.querySelector('.trow[data-id="rq-1"]') as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    await waitFor(() => expect(window.location.search).toContain("decision=rq-1"));
    // Enter path on second row
    window.history.replaceState(null, "", "/console");
    cleanup();
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-2").length).toBeGreaterThan(0));
    const row2 = document.querySelector('.trow[data-id="rq-2"]') as HTMLElement;
    fireEvent.keyDown(row2, { key: "Enter" });
    await waitFor(() => expect(window.location.search).toContain("decision=rq-2"));
  });

  it("disconnected chip shows on fetch failure and retry refetches", async () => {
    stubApi({ failDecisions: true });
    render(<Shell />);
    const chip = await screen.findByTestId("disconnected-chip");
    expect(chip.textContent).toMatch(/DISCONNECTED/i);
    expect(chip.textContent).toMatch(/RETRY/i);
    fireEvent.click(chip);
    await waitFor(() => expect(chip).toBeTruthy());
  });

  it("honest empty state when ledger is empty", async () => {
    vi.stubGlobal("fetch", (async (url: string) => {
      if (String(url).includes("/reputation")) return new Response("[]", { status: 200 });
      return new Response("[]", { status: 200 });
    }) as typeof fetch);
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText(/No admissions recorded yet/).length).toBeGreaterThan(0));
    expect(document.getElementById("ledger-body")).toBeTruthy();
    expect(document.getElementById("hook-live")).toBeTruthy();
    expect(document.getElementById("t-adm")).toBeTruthy();
    expect(document.getElementById("t-rej")).toBeTruthy();
  });

  it("overview kpis carry lb/delta/v/u/foot + sparkline canvases", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getByTestId("overview-kpis")).toBeTruthy());
    const kpis = screen.getByTestId("overview-kpis");
    expect(kpis.querySelectorAll(".kpi").length).toBe(4);
    expect(kpis.querySelectorAll(".lb").length).toBe(4);
    expect(kpis.querySelectorAll(".delta").length).toBeGreaterThan(0);
    expect(kpis.querySelectorAll(".v").length).toBe(4);
    // chunks admitted/killed card uses .pair2 instead of .u, per template
    expect(kpis.querySelectorAll(".u").length).toBeGreaterThanOrEqual(3);
    expect(kpis.querySelectorAll(".foot").length).toBe(4);
    expect(kpis.querySelectorAll("canvas").length).toBe(4);
  });

  it("traces telemetry: admitted/killed, rrow-b top-4, hook-live ticker + credits, mode line", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    expect(document.getElementById("t-adm")).toBeTruthy();
    expect(document.getElementById("t-rej")).toBeTruthy();
    expect(document.getElementById("reason-bars")).toBeTruthy();
    expect(document.querySelectorAll("#reason-bars .rrow-b").length).toBeGreaterThan(0);
    // each reason bar carries track + count
    const bar = document.querySelector("#reason-bars .rrow-b")!;
    expect(bar.querySelector(".tr")).toBeTruthy();
    expect(bar.querySelector("b")).toBeTruthy();
    // hook tickers
    const live = document.getElementById("hook-live");
    expect(live?.textContent).toMatch(/PreRequestHook/);
    expect(document.getElementById("t-cred")).toBeTruthy();
    // panel header: counts, mode banner, live line
    expect(document.getElementById("led-count")).toBeTruthy();
    expect(document.getElementById("hook-live2")).toBeTruthy();
    const banner = document.getElementById("mode-banner");
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toMatch(/rewrite/);
    // ledger thead columns per template grid
    const head = document.querySelector(".thead");
    expect(head?.textContent).toMatch(/Time/);
    expect(head?.textContent).toMatch(/Request/);
    expect(head?.textContent).toMatch(/Chunks/);
    expect(head?.textContent).toMatch(/Tokens/);
    expect(head?.textContent).toMatch(/Status/);
    // measured footnote
    const meas = document.querySelector("#pv-traces .measured");
    expect(meas?.textContent).toMatch(/Eval/);
    expect(meas?.textContent).toMatch(/0\.480/);
  });

  it("palette lists pages/actions with keyboard nav; modal has 3 steps + snippet + copy", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    fireEvent.click(document.getElementById("btn-k")!);
    const pal = document.getElementById("pal");
    expect(pal?.classList.contains("open")).toBe(true);
    expect(pal!.textContent).toMatch(/Pages/);
    expect(pal!.textContent).toMatch(/Decisions/);
    expect(pal!.textContent).toMatch(/Actions/);
    expect(pal!.textContent).toMatch(/policy mode/i);
    expect(pal!.textContent).toMatch(/Deny/);
    expect(pal!.textContent).toMatch(/Reset layout/);
    expect(pal!.textContent).toMatch(/Connect/);
    // Esc closes
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.getElementById("pal")).toBeNull());
    // connect modal
    fireEvent.click(document.getElementById("sim-badge")!);
    const modal = document.getElementById("modal");
    expect(modal?.classList.contains("open")).toBe(true);
    expect(modal!.querySelectorAll(".m-step").length).toBe(3);
    expect(document.getElementById("cfg-snippet")).toBeTruthy();
    expect(document.getElementById("btn-copy")).toBeTruthy();
  });
});

describe("console shell: evals + playground + demo badge", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn() as unknown as typeof window.HTMLElement.prototype.scrollIntoView;
  });

  it("NAV exposes Evals + Playground with icons after Policy", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    const side = document.querySelector("aside.side")!;
    const order = [...side.querySelectorAll(".sitem[data-page]")].map((b) =>
      b.getAttribute("data-page"),
    );
    expect(order).toEqual(["traces", "autopsy", "sources", "policy", "evals", "playground"]);
    for (const p of ["evals", "playground"]) {
      const btn = side.querySelector(`.sitem[data-page="${p}"]`)!;
      expect(btn.textContent).toMatch(new RegExp(p === "evals" ? "Evals" : "Playground"));
      expect(btn.querySelector("svg"), `${p} icon`).toBeTruthy();
    }
  });

  it("clicking Evals/Playground nav goes to pv-evals/pv-playground sections", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    for (const p of ["evals", "playground"] as const) {
      fireEvent.click(document.querySelector(`.sitem[data-page="${p}"]`)!);
      const sec = document.getElementById(`pv-${p}`)!;
      expect(sec).toBeTruthy();
      expect(sec.classList.contains("on")).toBe(true);
      expect(sec.querySelector(".pv-head h2")).toBeTruthy();
      expect(sec.querySelector(".pv-head .why")).toBeTruthy();
      expect(document.getElementById("top-crumb")?.textContent).toBe(p);
    }
  });

  it("lazy sections render mocked content", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getByText("mocked evals section")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("mocked playground section")).toBeTruthy());
    expect(document.getElementById("pv-evals")?.textContent).toContain("mocked evals section");
    expect(document.getElementById("pv-playground")?.textContent).toContain("mocked playground section");
  });

  it("palette lists the Evals and Playground pages", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    fireEvent.click(document.getElementById("btn-k")!);
    const pal = document.getElementById("pal")!;
    expect(pal.textContent).toMatch(/Evals/);
    expect(pal.textContent).toMatch(/Playground/);
  });

  it("SIM badge appears with ?demo=1 and is absent without it", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    expect(document.getElementById("demo-badge")).toBeNull();
    cleanup();

    window.history.replaceState(null, "", "/console?demo=1");
    stubApi();
    render(<Shell />);
    // demo mode serves the labeled seed, not the fetch stub
    await waitFor(() => expect(screen.getAllByText("d_demo_001").length).toBeGreaterThan(0));
    const badge = document.getElementById("demo-badge")!;
    expect(badge).toBeTruthy();
    expect(badge.textContent).toMatch(/SIM/);
    expect(badge.getAttribute("title")).toContain("?demo=1");
    // LIVE chip keeps its id in demo mode
    expect(document.getElementById("sim-badge")?.textContent).toMatch(/LIVE/);
    cleanup();
    window.history.replaceState(null, "", "/console");
  });

  it("disconnected copy carries a ?demo=1 hint in demo mode", async () => {
    window.history.replaceState(null, "", "/console?demo=1");
    const hooks = await import("../lib/hooks");
    const spy = vi
      .spyOn(hooks, "useDecisions")
      .mockReturnValue({ data: null, error: "down", connected: false, refresh: vi.fn() });
    try {
      render(<Shell />);
      const chip = await screen.findByTestId("disconnected-chip");
      expect(chip.textContent).toContain("?demo=1");
      expect(document.getElementById("demo-badge")).toBeTruthy();
    } finally {
      spy.mockRestore();
      cleanup();
      window.history.replaceState(null, "", "/console");
    }
  });

  it("connect modal states the live-ledger / seed-data copy", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    fireEvent.click(document.getElementById("sim-badge")!);
    const modal = document.getElementById("modal")!;
    expect(modal.textContent).toContain("live sidecar ledger");
    expect(modal.textContent).toContain("?demo=1");
    expect(modal.textContent).not.toContain("ARCHITECTURE.md");
  });
});
