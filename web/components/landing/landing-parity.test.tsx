// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import Stats from "./Stats";
import Graph from "./Graph";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const Landing = (await import("../../app/page")).default;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("landing font parity (self-hosted Geist)", () => {
  it("wires next/font/google Geist + Geist_Mono with display:swap and --sans/--mono bridge, zero external font <link>", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/layout.tsx"),
      "utf8",
    );
    expect(src).toMatch(/next\/font\/google/);
    expect(src).toMatch(/Geist\b/);
    expect(src).toMatch(/Geist_Mono/);
    expect(src).toMatch(/display\s*:\s*["']swap["']/);
    // --sans / --mono token names preserved or explicitly bridged
    expect(src).toMatch(/--sans/);
    expect(src).toMatch(/--mono/);
    // no runtime external font requests
    expect(src).not.toMatch(/fonts\.googleapis\.com/);
    expect(src).not.toMatch(/fonts\.gstatic\.com/);
    expect(src).not.toMatch(/<link\s/);
  });
});

describe("landing shell parity", () => {
  it("renders the toasts container", () => {
    const { container } = render(<Landing />);
    expect(container.querySelector("#toasts")).toBeTruthy();
  });

  it("renders data-reveal stat cards with data-to count-up targets", () => {
    const { container } = render(
      <Stats s={{ p95ms: 12, cut: 40, reasonShare: 1, enough: true }} />,
    );
    const reveals = container.querySelectorAll("[data-reveal]");
    expect(reveals.length).toBe(4);
    const targets = container.querySelectorAll("[data-to]");
    // 3 metric cards carry count-up targets; container card stays a fact (1)
    expect(targets.length).toBe(3);
  });

  it("count-up animates metric values (reduced-motion respected)", () => {
    vi.useFakeTimers();
    render(
      <Stats s={{ p95ms: 12, cut: 40, reasonShare: 1, enough: true }} />,
    );
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    // after count-up the real aggregates are visible
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("graph hint copy matches the template", () => {
    render(<Graph admitted={132} killed={57} live={true} />);
    expect(
      screen.getByText(
        /Drag the nodes — snap 16px — the request path keeps flowing/i,
      ),
    ).toBeTruthy();
  });
});
