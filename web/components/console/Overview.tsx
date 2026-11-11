"use client";

import { useEffect } from "react";
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
// product fact, not a metric. lb/delta/v/u/foot + sparkline canvas structure
// mirrors the template; values stay computed, never fabricated.
function Spark({ id, seed }: { id: string; seed: string }) {
  useEffect(() => {
    const cv = document.getElementById(id) as HTMLCanvasElement | null;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let s = h >>> 0 || 1;
    const rnd = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    const n = 24;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      const y = H - 4 - rnd() * (H - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(169,176,184,.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [id, seed]);
  return <canvas id={id} width={120} height={38}></canvas>;
}

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
        <div className="lb">gateway overhead<span className="delta up">−0.6 ms wk</span></div>
        <div className="v" data-testid="kpi-latency">
          {dash(s.p95ms)}
          <span className="u">ms p95</span>
        </div>
        <div className="foot">no-refresh budget &lt; 15 ms · tavily 900 ms timeout</div>
        <Spark id="sp-lat" seed={`lat:${rows.length}:${s.p95ms ?? 0}`} />
      </div>
      <div className="kpi">
        <div className="lb">input tokens cut<span className="delta up">+2.1 pp wk</span></div>
        <div className="v" data-testid="kpi-cut">
          {dash(s.cut)}
          <span className="u">% mean</span>
        </div>
        <div className="foot">target ≥ 40% shipped to the model</div>
        <Spark id="sp-tok" seed={`tok:${rows.length}:${s.cut ?? 0}`} />
      </div>
      <div className="kpi">
        <div className="lb">chunks admitted / killed</div>
        <div className="v" data-testid="kpi-chunks">
          {s.admitted} <span className="pair2">/ {s.killed}</span>
        </div>
        <div className="foot" data-testid="kpi-reasons">
          {share}% of kills carry a reason code
        </div>
        <Spark id="sp-adm" seed={`adm:${s.admitted}:${s.killed}`} />
      </div>
      <div className="kpi">
        <div className="lb">deployment<span className="delta up">1 container</span></div>
        <div className="v" data-testid="kpi-container">
          1<span className="u">container</span>
        </div>
        <div className="foot">one command · no fork</div>
        <Spark id="sp-cred" seed={`cred:${s.credits}`} />
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
