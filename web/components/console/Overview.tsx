"use client";

import type { DecisionListItem } from "../../lib/api";
import { EVAL } from "../../lib/eval";
import { cutPct, fmtInt, MIN_SAMPLE, p95, reasonShare } from "../../lib/format";

export interface LedgerStats {
  admitted: number;
  killed: number;
  avgMs: number;
  p95ms: number | null;
  cut: number | null;
  reasonShare: number | null;
  credits: number;
  enough: boolean;
}

export function ledgerStats(rows: DecisionListItem[]): LedgerStats {
  const admitted = rows.reduce((s, r) => s + r.cout, 0);
  const killed = rows.reduce((s, r) => s + (r.cin - r.cout), 0);
  const avgMs = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.ms || 0), 0) / rows.length)
    : 0;
  const tin = rows.reduce((s, r) => s + r.tin, 0);
  const tout = rows.reduce((s, r) => s + r.tout, 0);
  return {
    admitted,
    killed,
    avgMs,
    p95ms: p95(rows.map((r) => r.ms)),
    cut: tin > 0 ? cutPct(tin, tout) : null,
    reasonShare: reasonShare(rows.flatMap((r) => r.reasons)),
    credits: rows.reduce((s, r) => s + (r.cred || 0), 0),
    enough: rows.length >= MIN_SAMPLE,
  };
}

// Overview KPIs computed from the same ledger the sidecar writes.
// Cards show "—" until MIN_SAMPLE decisions exist; the container card is a
// product fact, not a metric.
export function OverviewKPIs({ rows }: { rows: DecisionListItem[] }) {
  const s = ledgerStats(rows);
  const dash = (n: number | null) =>
    s.enough && n !== null ? fmtInt(n) : "—";
  const share =
    s.enough && s.reasonShare !== null
      ? `${Math.round(s.reasonShare * 100)}`
      : "—";
  return (
    <div className="kpis" id="kpis" data-testid="overview-kpis">
      <div className="kpi">
        <div className="lb">p95 gateway overhead</div>
        <div className="v" data-testid="kpi-latency">
          {dash(s.p95ms)}
          <span className="u">ms p95</span>
        </div>
        <div className="foot">no-refresh budget &lt; 15 ms p95</div>
      </div>
      <div className="kpi">
        <div className="lb">input tokens cut</div>
        <div className="v" data-testid="kpi-cut">
          {dash(s.cut)}
          <span className="u">% mean</span>
        </div>
        <div className="foot">target ≥ 40% shipped to the model</div>
      </div>
      <div className="kpi">
        <div className="lb">chunks admitted / killed</div>
        <div className="v" data-testid="kpi-chunks">
          {s.admitted} <span className="pair2">/ {s.killed}</span>
        </div>
        <div className="foot" data-testid="kpi-reasons">
          {share}% of kills carry a reason code
        </div>
      </div>
      <div className="kpi">
        <div className="lb">deployment</div>
        <div className="v" data-testid="kpi-container">
          1<span className="u">container</span>
        </div>
        <div className="foot">one command · no fork</div>
      </div>
    </div>
  );
}

// Measured eval strip. Every number comes from examples/eval/results.md.
export function MeasuredStrip() {
  return (
    <div className="measured" data-testid="measured-strip">
      <span className="tag">Eval · {EVAL.questions} questions</span>
      <span>
        tokens <b>{EVAL.tokenDelta}</b>
      </span>
      <span>
        mean latency <b>{EVAL.latency}</b>
      </span>
      <span>
        stale-source acc <b>{EVAL.staleSourceDeltaPp}</b>
      </span>
      <span>
        raw <b>
          {EVAL.raw} → {EVAL.curated}
        </b>
      </span>
      <span>
        reasoned drops <b>100%</b>
      </span>
      <small>source: {EVAL.source}</small>
    </div>
  );
}
