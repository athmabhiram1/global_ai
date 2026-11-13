import { useEffect, useRef } from "react";

// Count-up span mirroring the template's [data-to] behavior: animates from
// 0 to the target over ~1s once mounted, sets the final value immediately
// under prefers-reduced-motion.
function CountUp({ to, dec = 0 }: { to: number; dec?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.textContent = to.toFixed(dec);
      return;
    }
    const dur = 1000;
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * e).toFixed(dec);
      if (p >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [to, dec]);

  return (
    <span data-to={to} data-dec={dec} ref={ref}>
      0
    </span>
  );
}

// Static marketing strip, verbatim from the template: <15ms p95 overhead,
// ≥25% input tokens cut, 100% of dropped chunks carry a reason, 1 container.
// These are fixed template values, never per-card live numbers — the live
// ledger totals stay in the graph pill + console.
const CARDS = [
  { pre: "<", to: 15, u: "ms", cap: "p95 overhead · no refresh" },
  { pre: "≥", to: 25, u: "%", cap: "input tokens cut · context-heavy" },
  { pre: null, to: 100, u: "%", cap: "dropped chunks carry a reason code" },
  { pre: null, to: 1, u: null, cap: "container · one command · no fork" },
] as const;

export default function Stats() {
  return (
    <div className="stats-row">
      {CARDS.map((c, i) => (
        <div className="stat-c" key={c.cap} data-reveal style={{ ["--i" as string]: i }}>
          <div className="v">
            {c.pre !== null && <em>{c.pre}</em>}
            <CountUp to={c.to} />
            {c.u !== null && <span className="u">{c.u}</span>}
          </div>
          <p>{c.cap}</p>
        </div>
      ))}
    </div>
  );
}
