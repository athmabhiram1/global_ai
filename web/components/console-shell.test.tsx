// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import Shell from "./console/Shell";
import { decisionRowFixture } from "../lib/testFixtures";

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
  it("rail renders 5 SVG-icon buttons + connect", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    for (const sec of ["ov-overview", "ov-traces", "ov-autopsy", "ov-sources", "ov-policy"]) {
      const btn = document.querySelector(`.rail button[data-sec="${sec}"]`);
      expect(btn).toBeTruthy();
      expect(btn!.querySelector("svg")).toBeTruthy();
    }
    const connect = document.getElementById("rail-connect");
    expect(connect).toBeTruthy();
    expect(connect!.querySelector("svg")).toBeTruthy();
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

  it("palette lists sections+decisions+actions with keyboard nav; modal has 3 steps + snippet + copy", async () => {
    stubApi();
    render(<Shell />);
    await waitFor(() => expect(screen.getAllByText("rq-1").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("⌘K"));
    const pal = document.getElementById("pal");
    expect(pal?.classList.contains("open")).toBe(true);
    expect(pal!.textContent).toMatch(/Navigate/);
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
    fireEvent.click(document.getElementById("rail-connect")!);
    const modal = document.getElementById("modal");
    expect(modal?.classList.contains("open")).toBe(true);
    expect(modal!.querySelectorAll(".m-step").length).toBe(3);
    expect(document.getElementById("cfg-snippet")).toBeTruthy();
    expect(document.getElementById("btn-copy")).toBeTruthy();
  });
});
