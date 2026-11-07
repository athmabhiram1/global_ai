// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import Hero, { ROT_WORDS, ROT_MS } from "./Hero";
import Graph from "./Graph";
import Stats from "./Stats";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("landing rotating word", () => {
  it("uses the spec word list [poisoned|stale|duplicated|unverified|anonymous]", () => {
    expect(ROT_WORDS).toEqual([
      "poisoned",
      "stale",
      "duplicated",
      "unverified",
      "anonymous",
    ]);
  });

  it("rotates every 2.7s with the out class", () => {
    expect(ROT_MS).toBe(2700);
    vi.useFakeTimers();
    render(<Hero />);
    const el = document.getElementById("rotw")!;
    expect(el.textContent).toBe("poisoned");
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(el.classList.contains("out")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(el.textContent).toBe("stale");
    expect(el.classList.contains("out")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2700 + 300);
    });
    expect(el.textContent).toBe("duplicated");
  });
});

describe("landing stats honesty", () => {
  it("shows — for metric cards with fewer than 5 decisions", () => {
    render(
      <Stats
        s={{ p95ms: 12, cut: 40, reasonShare: 1, enough: false }}
      />,
    );
    const dashes = screen.getAllByText("—");
    // 3 metric cards dash; container card stays a product fact (1)
    expect(dashes.length).toBe(3);
  });

  it("shows real aggregates once 5+ decisions exist", () => {
    render(
      <Stats s={{ p95ms: 12, cut: 40, reasonShare: 1, enough: true }} />,
    );
    expect(screen.queryAllByText("—").length).toBe(0);
  });
});

describe("landing graph honesty", () => {
  it("has a Reset layout button and draggable snap nodes", () => {
    const { container } = render(
      <Graph admitted={132} killed={57} live={true} />,
    );
    expect(screen.getByText("Reset layout")).toBeTruthy();
    const nodes = container.querySelectorAll(".node");
    expect(nodes.length).toBeGreaterThan(0);
    nodes.forEach((n) => {
      expect(n.getAttribute("data-drag")).toBe("true");
    });
  });

  it("shows LIVE badge with real totals when connected", () => {
    render(<Graph admitted={132} killed={57} live={true} />);
    expect(screen.getByText(/LIVE/)).toBeTruthy();
    expect(document.getElementById("gw-adm")!.textContent).toBe("132");
    expect(document.getElementById("gw-kill")!.textContent).toBe("57");
  });

  it("shows plain offline copy and never a LIVE badge when disconnected", () => {
    render(<Graph admitted={132} killed={57} live={false} />);
    expect(screen.queryByText(/LIVE/)).toBeNull();
    expect(screen.getByText(/offline/i)).toBeTruthy();
    // last-successful data still rendered, never fabricated rows
    expect(document.getElementById("gw-adm")!.textContent).toBe("132");
  });
});
