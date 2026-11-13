// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PlaygroundSection from "./Playground";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/console");
});

describe("PlaygroundSection real mode", () => {
  it("shows the honest-disabled panel with no fake Run button or fabricated scores", () => {
    window.history.replaceState(null, "", "/console");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<PlaygroundSection />);
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Playground");
    expect(text).toContain("No generation endpoint is configured");
    expect(
      screen.getByRole("link", { name: /evals/i }),
    ).toHaveProperty("tagName", "A");
    expect(document.querySelector('a[href="#pv-evals"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: /run/i })).toBeNull();
    expect(screen.queryByText(/live run/i)).toBeNull();
    expect(screen.queryByText(/sample output/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("PlaygroundSection demo mode", () => {
  it("shows the sample-output badge with two fixed answers and no fetch", () => {
    window.history.replaceState(null, "", "/console?demo=1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<PlaygroundSection />);
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(screen.getByText(/sample output/i)).toBeTruthy();
    expect(text).toMatch(/not a live run/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
