"use client";

import { EVAL, EVAL_FAMILIES } from "../../lib/eval";

// Before/after eval ledger. Every number renders from lib/eval.ts constants
// (sourced from examples/eval/results.md); identical in real and demo mode.
export default function EvalsSection() {
  if (
    !EVAL ||
    typeof (EVAL as { raw?: unknown }).raw !== "string" ||
    !EVAL_FAMILIES
  ) {
    return (
      <p className="why" role="alert" data-testid="evals-empty">
        Eval data unavailable — see examples/eval/results.md.
      </p>
    );
  }
  return (
    <div data-testid="evals-section">
      <div className="measured" data-testid="evals-headline">
        <span className="tag">
          Eval · {EVAL.questions} questions × {EVAL.repeats} repeats
        </span>
        <span>
          accuracy{" "}
          <b>
            {EVAL.raw} → {EVAL.curated}
          </b>{" "}
          ({EVAL.staleSourceDeltaPp})
        </span>
        <span>
          provider tokens{" "}
          <b>
            {EVAL.rawTokens} → {EVAL.curatedTokens}
          </b>{" "}
          (<b>{EVAL.tokenDelta}</b>)
        </span>
        <span>
          mean latency{" "}
          <b>
            {EVAL.latencyMs} ms → {EVAL.latencyMs} ms
          </b>
        </span>
      </div>

      <div className="panel" data-testid="evals-families">
        <div className="panel-h">
          <b>accuracy by family</b>
          <span className="cnt">raw → curated</span>
        </div>
        <div
          className="thead"
          style={{ gridTemplateColumns: "1.4fr 90px 90px 90px" }}
        >
          <span>Family</span>
          <span>Range</span>
          <span style={{ textAlign: "right" }}>Raw</span>
          <span style={{ textAlign: "right" }}>Curated</span>
        </div>
        <div className="tbody">
          {EVAL_FAMILIES.map((f) => (
            <div
              className="trow"
              key={f.id}
              style={{ gridTemplateColumns: "1.4fr 90px 90px 90px" }}
            >
              <span className="rq">
                <b>{f.label}</b>
              </span>
              <span className="mono">{f.range}</span>
              <span className="num">{f.raw}</span>
              <span className="num kept">{f.curated}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="why" data-testid="evals-method">
        Method: plugin in annotate mode (observe only, request passes through)
        vs rewrite mode. Each cell is the mean of {EVAL.repeats} repeats
        against the deterministic echo mock; provider is the deterministic echo
        mock, so token/latency deltas measure curation only — no model
        judgement is involved.
      </p>
      <p className="why" data-testid="evals-source">
        <small>Source: {EVAL.source} (committed)</small>
      </p>
    </div>
  );
}
