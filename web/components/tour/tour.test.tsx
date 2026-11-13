// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  TOUR_STEPS,
  demoLandingRedirect,
  isDemoStart,
  isTourStart,
  nextIndex,
  prevIndex,
  prefersReducedMotion,
  resolveTarget,
} from "../../lib/tour";
import TourOverlay from "./TourOverlay";
import TourHost from "./TourHost";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

describe("tour model", () => {
  it("has 9 steps mirroring the template tour, ending centered", () => {
    expect(TOUR_STEPS.length).toBe(9);
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].end).toBe(true);
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].selectors).toEqual([]);
  });

  it("targets only real console DOM ids (centered fallback otherwise)", () => {
    const sels = TOUR_STEPS.flatMap((s) => s.selectors);
    expect(sels.length).toBeGreaterThan(0);
    for (const sel of sels) {
      expect(sel).toMatch(
        /#(kpis|ledger-body|drawer|dr-body|aut-influence|aut-actions|rep-body|deny-chips)|\[data-testid/,
      );
    }
  });

  it("narrates without inventing ledger numbers", () => {
    const blob = TOUR_STEPS.map((s) => `${s.title} ${s.text}`).join(" ");
    expect(blob).not.toMatch(/rq-20\d\d/);
    expect(blob).not.toMatch(/chunk c\d/);
    expect(blob).not.toMatch(/\d+ chunks in/);
    expect(blob).not.toMatch(/0\.33/);
  });

  it("advances and retreats one step, clamped at the ends", () => {
    expect(nextIndex(0)).toBe(1);
    expect(prevIndex(1)).toBe(0);
    expect(prevIndex(0)).toBe(0);
    expect(nextIndex(TOUR_STEPS.length - 1)).toBe(TOUR_STEPS.length - 1);
  });

  it("detects ?demo=1 / ?tour=1 autostart", () => {
    expect(isDemoStart("?demo=1")).toBe(true);
    expect(isDemoStart("?demo=1&x=2")).toBe(true);
    expect(isDemoStart("?tour=1")).toBe(false);
    expect(isDemoStart("")).toBe(false);
    expect(isTourStart("?tour=1")).toBe(true);
    expect(isTourStart("?demo=1")).toBe(false);
  });

  it("redirects landing demo starts to the console", () => {
    expect(demoLandingRedirect("/", "?demo=1")).toBe("/console?demo=1");
    expect(demoLandingRedirect("/console", "?demo=1")).toBeNull();
    expect(demoLandingRedirect("/", "")).toBeNull();
  });

  it("resolves the first existing selector, null when nothing matches", () => {
    document.body.innerHTML = '<div id="kpis"></div>';
    const el = resolveTarget(["#nope", "#kpis"]);
    expect(el).toBeTruthy();
    expect((el as HTMLElement).id).toBe("kpis");
    document.body.innerHTML = "";
    expect(resolveTarget(["#nope"])).toBeNull();
  });

  it("respects prefers-reduced-motion", () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    (window as unknown as { matchMedia: unknown }).matchMedia = mm;
    expect(prefersReducedMotion()).toBe(true);
    mm.mockReturnValue({ matches: false });
    expect(prefersReducedMotion()).toBe(false);
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });
});

describe("tour overlay", () => {
  it("renders #tour-spot + #tour-card with counter, dots, Back/Skip/Next", () => {
    render(<TourOverlay auto={false} onClose={() => {}} />);
    expect(document.getElementById("tour-spot")).toBeTruthy();
    expect(document.getElementById("tour-card")).toBeTruthy();
    expect(screen.getByText("STEP 1 / 9")).toBeTruthy();
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeTruthy();
    expect(document.querySelectorAll("#tour-dots i").length).toBe(9);
    expect(screen.getByText("Back")).toBeTruthy();
    expect(screen.getByText("Next →")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
  });

  it("Next advances, Back retreats, Skip and Esc close", () => {
    const onClose = vi.fn();
    render(<TourOverlay auto={false} onClose={onClose} />);
    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText("STEP 2 / 9")).toBeTruthy();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("STEP 1 / 9")).toBeTruthy();
    fireEvent.click(screen.getByText("Skip"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows Finish on the last step and closes", () => {
    const onClose = vi.fn();
    render(<TourOverlay auto={false} onClose={onClose} />);
    for (let k = 0; k < 8; k++) fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText("END")).toBeTruthy();
    fireEvent.click(screen.getByText(/Finish/));
    expect(onClose).toHaveBeenCalled();
  });

  it("auto mode shows the AUTO badge and progress bar", () => {
    render(<TourOverlay auto={true} onClose={() => {}} />);
    expect(screen.getByText("AUTO")).toBeTruthy();
    expect(
      document.getElementById("tour-prog")?.classList.contains("on"),
    ).toBe(true);
  });

  it("manual mode shows no AUTO badge and no progress bar", () => {
    render(<TourOverlay auto={false} onClose={() => {}} />);
    expect(screen.queryByText("AUTO")).toBeNull();
    expect(
      document.getElementById("tour-prog")?.classList.contains("on"),
    ).toBe(false);
  });
});

describe("tour host (?demo=1)", () => {
  it("autostarts the tour and shows a Guided demo badge on /console?demo=1", () => {
    window.history.replaceState({}, "", "/console?demo=1");
    render(<TourHost />);
    expect(screen.getByText("Guided demo")).toBeTruthy();
    expect(screen.getByText("STEP 1 / 9")).toBeTruthy();
    expect(screen.getByText("AUTO")).toBeTruthy();
  });

  it("manual ?tour=1 starts without auto badge or demo badge", () => {
    window.history.replaceState({}, "", "/console?tour=1");
    render(<TourHost />);
    expect(screen.queryByText("Guided demo")).toBeNull();
    expect(screen.getByText("STEP 1 / 9")).toBeTruthy();
    expect(screen.queryByText("AUTO")).toBeNull();
  });

  it("stays idle with no query param", () => {
    window.history.replaceState({}, "", "/console");
    render(<TourHost />);
    expect(document.getElementById("tour-card")).toBeNull();
    expect(screen.queryByText("Guided demo")).toBeNull();
  });
});
