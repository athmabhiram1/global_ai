// Guided-tour model for the landing + console tour.
// Steps narrate only: every number the UI shows still comes from live
// props/store. No step text contains ledger figures, request ids, or chunk
// ids, so the tour can never fabricate data — it guards each selector and
// falls back to a centered card when the target is absent (e.g. no rows yet,
// sidecar unreachable, or running on the landing page).

export interface TourStep {
  id: string;
  title: string;
  text: string;
  /** Selectors tried in order; first match wins. Empty = centered card. */
  selectors: string[];
  /** Console section to scroll into view before spotlighting. */
  section?: string;
  /** Auto-advance delay in ms (used only when the tour runs in auto). */
  dur: number;
  end?: boolean;
}

// Mirrors the template TOUR order (scoreboard → ledger row → drawer flame →
// autopsy chunk → influence → flag → sources → policy kill-list → close) but
// targets the real Next.js console DOM: #kpis, #ledger-body .trow, #drawer
// .flame, [data-testid="autopsy-*"], #aut-influence,
// [data-testid="mark-unreliable"], #rep-body .rrow, #deny-chips.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "scoreboard",
    title: "The scoreboard",
    text: "Every number is computed from the admission ledger — the same rows the sidecar wrote.",
    selectors: ["#kpis"],
    section: "ov-overview",
    dur: 5000,
  },
  {
    id: "ledger-row",
    title: "One row = one request",
    text: "Each decision shows chunks in versus admitted, with a reason code on every kill. Next: we open it.",
    selectors: ["#ledger-body .trow[data-id]", "#ledger-body .trow"],
    section: "ov-traces",
    dur: 5400,
  },
  {
    id: "drawer-flame",
    title: "The decision file",
    text: "Flame graph of the PreRequestHook pipeline; below, every chunk with its score and verdict.",
    selectors: ["#dr-body .flame", "#drawer .flame", "#drawer"],
    section: "ov-traces",
    dur: 6000,
  },
  {
    id: "autopsy-chunk",
    title: "The proof",
    text: "A retained chunk can be ablated — replayed with and without it. Next: the counterfactual.",
    selectors: [
      '#drawer [data-testid^="autopsy-"]',
      "#drawer .ck-act",
      "#drawer",
    ],
    section: "ov-traces",
    dur: 5400,
  },
  {
    id: "influence",
    title: "Influence, measured",
    text: "The replay aligns both answers sentence by sentence and files an influence score — proof the chunk mattered.",
    selectors: ["#aut-influence"],
    section: "ov-autopsy",
    dur: 7000,
  },
  {
    id: "flag",
    title: "One click → fleet-wide",
    text: "Flagging a domain feeds the one reputation table every app shares.",
    selectors: ['[data-testid="mark-unreliable"]', "#aut-actions"],
    section: "ov-autopsy",
    dur: 5400,
  },
  {
    id: "sources",
    title: "One table, every app",
    text: "Utility per domain as a Beta posterior, decayed daily — a burn in one app shields the rest.",
    selectors: ["#rep-body .rrow", "#rep-body"],
    section: "ov-sources",
    dur: 5800,
  },
  {
    id: "kill-list",
    title: "Enforced, not advisory",
    text: "The kill list is resolved policy — denied domains hard-block before any model call.",
    selectors: ["#deny-chips"],
    section: "ov-policy",
    dur: 5800,
  },
  {
    id: "close",
    title: "Which sources are allowed to speak",
    text: "Compression asks how few tokens. Context Curator asks which sources speak — and proves every decision.",
    selectors: [],
    dur: 6400,
    end: true,
  },
];

export function isDemoStart(search: string): boolean {
  try {
    return new URLSearchParams(search).has("demo");
  } catch {
    return false;
  }
}

export function isTourStart(search: string): boolean {
  try {
    return new URLSearchParams(search).has("tour");
  } catch {
    return false;
  }
}

/** Landing demo starts run on the console (the tour targets console DOM). */
export function demoLandingRedirect(
  pathname: string,
  search: string,
): string | null {
  if (pathname === "/" && isDemoStart(search)) return "/console?demo=1";
  return null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** First matching element for the selector list, or null (centered card). */
export function resolveTarget(selectors: string[]): Element | null {
  if (typeof document === "undefined") return null;
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch {
      // Invalid selector — try the next fallback.
    }
  }
  return null;
}

export function nextIndex(i: number): number {
  return Math.min(i + 1, TOUR_STEPS.length - 1);
}

export function prevIndex(i: number): number {
  return Math.max(i - 1, 0);
}
