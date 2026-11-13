// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import EvalsSection from "./Evals";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/console");
});

function renderEvals(search: string): string {
  window.history.replaceState(null, "", `/console${search}`);
  const { container } = render(<EvalsSection />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("EvalsSection", () => {
  it("renders the four headline numbers + source label", () => {
    renderEvals("");
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("52.0");
    expect(text).toContain("-12.0%");
    expect(text).toContain("8 ms");
    expect(text).toContain("0.480");
    expect(text).toContain("1.000");
    expect(screen.getByText(/examples\/eval\/results\.md/)).toBeTruthy();
  });

  it("renders the per-family mini-table", () => {
    renderEvals("");
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    for (const family of [
      "Pricing",
      "Freshness",
      "Version",
      "Law",
      "Retention",
      "Mixed",
    ]) {
      expect(text).toContain(family);
    }
    expect(text).toContain("0.00");
    expect(text).toContain("1.00");
  });

  it("carries the echo-mock methodology caveat", () => {
    renderEvals("");
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/echo mock/i);
    expect(text).toMatch(/curation only/i);
  });

  it("is identical with and without ?demo=1 (real data only)", () => {
    const real = renderEvals("");
    cleanup();
    const demo = renderEvals("?demo=1");
    expect(demo).toBe(real);
  });
});
