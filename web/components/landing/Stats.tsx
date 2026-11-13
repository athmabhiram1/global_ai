import { useEffect, useRef } from "react";

export interface LandingStats {
  p95ms: number | null;
  cut: number | null;
  reasonShare: number | null;
  enough: boolean;
}

// Count-up span mirroring the template's [data-to] behavior: animates from
// 0 to the target over ~1s once mounted, sets the final value immediately
// under prefers-reduced-motion. Rendered only for real aggregates; while
// fewer than MIN_SAMPLE decisions exist the card shows "—" with no target.
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

// Stat cards from real aggregates. With fewer than MIN_SAMPLE decisions the
// metric cards render "—" rather than a misleading number; the container
// card is a product fact, not a metric.
export default function Stats({ s }: { s: LandingStats }) {
  const dash = <span>—</span>;
  const share =
    s.enough && s.reasonShare !== null
      ? `${Math.round(s.reasonShare * 100)}`
      : null;
  return (
    <div className="stats-row">
      <div className="stat-c" data-reveal style={{ ["--i" as string]: 0 }}>
        <div className="v">
          <em>&lt;</em>
          {s.enough && s.p95ms !== null ? (
            <CountUp to={s.p95ms} />
          ) : (
            dash
          )}
          <span className="u">ms</span>
        </div>
        <p>p95 overhead · no refresh</p>
      </div>
      <div className="stat-c" data-reveal style={{ ["--i" as string]: 1 }}>
        <div className="v">
          <em>≥</em>
          {s.enough && s.cut !== null ? <CountUp to={s.cut} /> : dash}
          <span className="u">%</span>
        </div>
        <p>input tokens cut</p>
      </div>
      <div className="stat-c" data-reveal style={{ ["--i" as string]: 2 }}>
        <div className="v">
          {share !== null ? <CountUp to={Number(share)} /> : dash}
          <span className="u">%</span>
        </div>
        <p>dropped chunks carry a reason</p>
      </div>
      <div className="stat-c" data-reveal style={{ ["--i" as string]: 3 }}>
        <div className="v">
          <span>1</span>
        </div>
        <p>container · no fork</p>
      </div>
    </div>
  );
}
