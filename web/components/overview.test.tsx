// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OverviewKPIs, MeasuredStrip, ledgerStats } from "./console/Overview";
import { decisionListItemFixture } from "../lib/testFixtures";

afterEach(() => cleanup());

function fiveRows() {
  return [0, 1, 2, 3, 4].map((i) => ({
    ...decisionListItemFixture,
    id: `rq-${i}`,
    ms: 8 + i,
    tin: 4000,
    tout: 3520,
    cin: 3,
    cout: 2,
    cred: i === 0 ? 2 : 0,
    reasons: i < 2 ? ["stale"] : [],
  }));
}

describe("OverviewKPIs", () => {
  it("computes p95, cut, admitted/killed and reason share from the ledger", () => {
    render(<OverviewKPIs rows={fiveRows()} />);
    // p95 of [8,9,10,11,12] = 12
    expect(screen.getByTestId("kpi-latency").textContent).toContain("12");
    // (1 - 17600/20000) = 12%
    expect(screen.getByTestId("kpi-cut").textContent).toContain("12");
    expect(screen.getByTestId("kpi-chunks").textContent).toContain("10");
    expect(screen.getByTestId("kpi-chunks").textContent).toContain("5");
    // 2 kills with reason / 2 kills = 100%
    expect(screen.getByTestId("kpi-reasons").textContent).toContain("100%");
    expect(screen.getByTestId("kpi-container").textContent).toContain("1");
  });

  it("renders — when fewer than 5 decisions exist", () => {
    render(<OverviewKPIs rows={[decisionListItemFixture]} />);
    expect(screen.getByTestId("kpi-latency").textContent).toContain("—");
    expect(screen.getByTestId("kpi-cut").textContent).toContain("—");
    expect(screen.getByTestId("kpi-reasons").textContent).toContain("—");
    // container card is a product fact, always 1
    expect(screen.getByTestId("kpi-container").textContent).toContain("1");
  });

  it("ledgerStats exposes admitted/killed totals for the landing graph", () => {
    const s = ledgerStats(fiveRows());
    expect(s.admitted).toBe(10);
    expect(s.killed).toBe(5);
    expect(s.enough).toBe(true);
    expect(ledgerStats([decisionListItemFixture]).enough).toBe(false);
  });
});

describe("MeasuredStrip", () => {
  it("publishes the eval numbers: 0.480 -> 1.000, -12.0%, 8 ms", () => {
    render(<MeasuredStrip />);
    const strip = screen.getByTestId("measured-strip");
    expect(strip.textContent).toContain("0.480");
    expect(strip.textContent).toContain("1.000");
    expect(strip.textContent).toContain("12.0%");
    expect(strip.textContent).toContain("8 ms");
    expect(strip.textContent).toContain("50");
  });
});
