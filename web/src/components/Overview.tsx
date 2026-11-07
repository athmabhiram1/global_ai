import type { DecisionListItem } from '../api'

// Overview KPIs computed from the same ledger the PostLLMHook writes
// (template.html renderKPIs): gateway overhead, input-token cut,
// admitted/killed chunks, Tavily credits per session.
export function OverviewKPIs({ rows }: { rows: DecisionListItem[] }) {
  const avgMs = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.ms || 0), 0) / rows.length)
    : 0
  const tin = rows.reduce((s, r) => s + r.tin, 0)
  const tout = rows.reduce((s, r) => s + r.tout, 0)
  const cut = tin ? Math.round((1 - tout / tin) * 100) : 0
  const admitted = rows.reduce((s, r) => s + r.cout, 0)
  const killed = rows.reduce((s, r) => s + (r.cin - r.cout), 0)
  const cred = rows.reduce((s, r) => s + (r.cred || 0), 0)
  return (
    <div className="kpis" data-testid="overview-kpis">
      <div className="kpi">
        <div className="lb">gateway overhead</div>
        <div className="v" data-testid="kpi-latency">
          {avgMs}
          <span className="u">ms mean</span>
        </div>
        <div className="foot">no-refresh budget &lt; 15 ms p95</div>
      </div>
      <div className="kpi">
        <div className="lb">input tokens cut</div>
        <div className="v" data-testid="kpi-cut">
          {cut}
          <span className="u">% mean</span>
        </div>
        <div className="foot">target ≥ 40% shipped to the model</div>
      </div>
      <div className="kpi">
        <div className="lb">chunks admitted / killed</div>
        <div className="v" data-testid="kpi-chunks">
          {admitted} <span className="pair2">/ {killed}</span>
        </div>
        <div className="foot">100% of kills carry a reason code</div>
      </div>
      <div className="kpi">
        <div className="lb">tavily credits</div>
        <div className="v" data-testid="kpi-credits">
          {cred}
          <span className="u">/ session</span>
        </div>
        <div className="foot">cap 2 per request at PreRequestHook</div>
      </div>
    </div>
  )
}

// Measured eval strip. Every number comes from examples/eval/results.md
// (50 questions × 3 repeats) and the console template: raw accuracy 0.480,
// curated 1.000, provider tokens −12.0%, mean latency 9 ms.
export const EVAL_NUMBERS = {
  raw: '0.480',
  curated: '1.000',
  tokenDelta: '−12.0%',
  latency: '9 ms',
} as const

export function MeasuredStrip() {
  return (
    <div className="measured" data-testid="measured-strip">
      <span className="tag">Eval · 50 questions</span>
      <span>
        tokens <b>{EVAL_NUMBERS.tokenDelta}</b>
      </span>
      <span>
        mean latency <b>{EVAL_NUMBERS.latency}</b>
      </span>
      <span>
        stale-source acc <b>+52.0 pp</b>
      </span>
      <span>
        raw <b>{EVAL_NUMBERS.raw} → {EVAL_NUMBERS.curated}</b>
      </span>
      <span>
        reasoned drops <b>100%</b>
      </span>
      <small>every claim must come from eval/results.md before submission</small>
    </div>
  )
}
