// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";
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

describe("landing logo link parity (no UA visited purple)", () => {
  it("styles .logo in all link states so it never shows default link colors", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "../../src/console.css"),
      "utf8",
    );
    // base rule carries the brand color, not the browser default
    expect(css).toMatch(/\.logo\s*\{[^}]*color:\s*var\(--t1\)/);
    expect(css).toMatch(/\.logo\s*\{[^}]*text-decoration:\s*none/);
    // visited/hover/active must not fall back to purple+underline
    expect(css).toMatch(/\.logo:visited/);
  });
});

describe("landing shell parity", () => {
  it("renders the toasts container", () => {
    const { container } = render(<Landing />);
    expect(container.querySelector("#toasts")).toBeTruthy();
  });

  it("lnav: logo home + section anchors + Search chip + Guided tour + Open console", () => {
    const { container } = render(<Landing />);
    const nav = container.querySelector(".lnav");
    expect(nav).toBeTruthy();
    expect(nav!.querySelector('a.logo[href="/"]')).toBeTruthy();
    const links = Array.from(nav!.querySelectorAll("nav a"));
    expect(links.map((a) => a.textContent)).toEqual([
      "Traces",
      "Autopsy",
      "Sources",
      "Policy",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/console#pv-traces",
      "/console#pv-autopsy",
      "/console#pv-sources",
      "/console#pv-policy",
    ]);
    // Search ⌘K chip routes to the console where the real palette lives
    const chip = nav!.querySelector('a.kchip[href="/console"]');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toMatch(/Search/);
    expect(chip!.textContent).toMatch(/⌘K/);
    expect(screen.getByText("Guided tour")).toBeTruthy();
    const open = nav!.querySelectorAll('a[href="/console"]');
    expect(
      Array.from(open).some((a) => /Open console/.test(a.textContent ?? "")),
    ).toBe(true);
  });

  it("Guided tour dispatches cc-tour-start", () => {
    render(<Landing />);
    const seen: Event[] = [];
    const on = (e: Event) => seen.push(e);
    window.addEventListener("cc-tour-start", on);
    try {
      fireEvent.click(screen.getByText("Guided tour"));
      expect(seen.length).toBe(1);
    } finally {
      window.removeEventListener("cc-tour-start", on);
    }
  });

  it("renders centered hero: eyebrow pill, rotator headline, sub, CTAs", () => {
    const { container } = render(<Landing />);
    const hero = container.querySelector("section.hero");
    expect(hero).toBeTruthy();
    expect(hero!.querySelector(".eyebrow")!.textContent).toMatch(
      /ADMISSION CONTROL/,
    );
    const h1 = hero!.querySelector("h1")!;
    expect(h1.textContent).toMatch(/Your agent just read a/);
    expect(h1.textContent).toMatch(/The gateway has an opinion now/);
    expect(hero!.querySelector("#rotw")).toBeTruthy();
    const open = hero!.querySelector('a[href="/console"]');
    expect(open!.textContent).toMatch(/Open the console/);
    expect(
      screen.getByText("Connect your sidecar").closest("a"),
    ).toBeTruthy();
    expect(
      screen
        .getByText("Connect your sidecar")
        .closest("a")!
        .getAttribute("href"),
    ).toBe("/console");
    // graph frame lives below the hero in its own full-width wrapper
    expect(container.querySelector(".graph-outer .graph-frame")).toBeTruthy();
    expect(container.querySelector(".hero-grid")).toBeNull();
  });

  it("renders boxed stat cards and the template footer quote", () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll(".stats-row .stat-c").length).toBe(4);
    expect(
      screen.getByText(/Compression asks how few tokens/),
    ).toBeTruthy();
    expect(
      screen.getByText(/We ask which sources are allowed to speak/),
    ).toBeTruthy();
    expect(container.querySelector("#boot-dot")).toBeTruthy();
    expect(container.querySelector("#boot-txt")).toBeTruthy();
    // right side: live sidecar state · ⌘K · guided demo ?demo=1
    expect(screen.getByText(/\?demo=1/)).toBeTruthy();
  });

  it("emits no external font requests in rendered output or document head", () => {
    const { container } = render(<Landing />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
    expect(html).not.toMatch(/<link/i);
    expect(document.head.innerHTML).not.toMatch(/fonts\.googleapis\.com/);
    expect(document.head.innerHTML).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("renders data-reveal stat cards with data-to count-up targets", () => {
    const { container } = render(<Stats />);
    const reveals = container.querySelectorAll("[data-reveal]");
    expect(reveals.length).toBe(4);
    const targets = container.querySelectorAll("[data-to]");
    // all four static template values carry count-up targets
    expect(targets.length).toBe(4);
  });

  it("count-up animates static values (reduced-motion respected)", () => {
    vi.useFakeTimers();
    render(<Stats />);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    // after count-up the template values are visible
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("graph hint copy matches the template", () => {
    render(<Graph admitted={132} killed={57} live={true} />);
    expect(
      screen.getByText(
        /Drag the nodes — snap 16px — the request path keeps flowing/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Killed chunks fall out with reason codes/i),
    ).toBeTruthy();
  });

  it("graph pill shows live totals from real ledger props", () => {
    render(<Graph admitted={132} killed={57} live={true} />);
    expect(screen.getByText(/LIVE/)).toBeTruthy();
    expect(document.getElementById("gw-adm")!.textContent).toBe("132");
    expect(document.getElementById("gw-kill")!.textContent).toBe("57");
  });
});
