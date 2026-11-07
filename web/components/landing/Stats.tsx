import { MIN_SAMPLE, fmtInt } from "../../lib/format";

export interface LandingStats {
  p95ms: number | null;
  cut: number | null;
  reasonShare: number | null;
  enough: boolean;
}

// Stat cards from real aggregates. With fewer than MIN_SAMPLE decisions the
// metric cards render "—" rather than a misleading number; the container
// card is a product fact, not a metric.
export default function Stats({ s }: { s: LandingStats }) {
  const v = (n: number | null) =>
    s.enough && n !== null ? fmtInt(n) : "—";
  const share =
    s.enough && s.reasonShare !== null
      ? `${Math.round(s.reasonShare * 100)}`
      : "—";
  return (
    <div className="stats-row">
      <div className="stat-c">
        <div className="v">
          <em>&lt;</em>
          <span>{v(s.p95ms)}</span>
          <span className="u">ms</span>
        </div>
        <p>p95 overhead · no refresh</p>
      </div>
      <div className="stat-c">
        <div className="v">
          <em>≥</em>
          <span>{v(s.cut)}</span>
          <span className="u">%</span>
        </div>
        <p>input tokens cut · context-heavy</p>
      </div>
      <div className="stat-c">
        <div className="v">
          <span>{share}</span>
          <span className="u">%</span>
        </div>
        <p>dropped chunks carry a reason code</p>
      </div>
      <div className="stat-c">
        <div className="v">
          <span>1</span>
        </div>
        <p>container · one command · no fork</p>
      </div>
    </div>
  );
}
