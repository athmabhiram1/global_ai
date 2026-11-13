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
  it("uses the spec word list [stale|poisoned|duplicated|unverified|anonymous]", () => {
    expect(ROT_WORDS).toEqual([
      "stale",
      "poisoned",
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
    expect(el.textContent).toBe("stale");
    act(() => {
      vi.advanceTimersByTime(2700);
    });
    expect(el.classList.contains("out")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(el.textContent).toBe("poisoned");
    expect(el.classList.contains("out")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2700 + 300);
    });
    expect(el.textContent).toBe("duplicated");
  });

  it("respects prefers-reduced-motion: static first word, no timer", () => {
    const orig = window.matchMedia;
    window.matchMedia = (() => ({
      matches: true,
    })) as unknown as typeof window.matchMedia;
    try {
      vi.useFakeTimers();
      render(<Hero />);
      const el = document.getElementById("rotw")!;
      expect(el.textContent).toBe("stale");
      act(() => {
        vi.advanceTimersByTime(2700 * 3 + 900);
      });
      expect(el.textContent).toBe("stale");
      expect(el.classList.contains("out")).toBe(false);
    } finally {
      window.matchMedia = orig;
    }
  });
});

describe("landing stat cards (static template strip)", () => {
  it("renders the four verbatim template values with count-up targets", () => {
    const { container } = render(<Stats />);
    // static marketing strip: data-to targets verbatim from the template
    const targets = Array.from(container.querySelectorAll("[data-to]")).map(
      (el) => el.getAttribute("data-to"),
    );
    expect(targets).toEqual(["15", "25", "100", "1"]);
    expect(screen.getByText(/p95 overhead · no refresh/)).toBeTruthy();
    expect(screen.getByText(/input tokens cut · context-heavy/)).toBeTruthy();
    expect(
      screen.getByText(/dropped chunks carry a reason code/),
    ).toBeTruthy();
    expect(screen.getByText(/container · one command · no fork/)).toBeTruthy();
  });

  it("count-up animates the static values (reduced-motion respected)", () => {
    vi.useFakeTimers();
    render(<Stats />);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("never renders a — placeholder: live numbers stay in the graph pill", () => {
    render(<Stats />);
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

  it("shows — totals while fewer than 5 ledger rows exist", () => {
    render(<Graph admitted={3} killed={1} live={true} enough={false} />);
    expect(document.getElementById("gw-adm")!.textContent).toBe("—");
    expect(document.getElementById("gw-kill")!.textContent).toBe("—");
  });
});
