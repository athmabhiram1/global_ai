"use client";

import { api, type RepItem } from "../../lib/api";

export function SourcesTable({
  rows,
  onGood,
  onBad,
  onDeny,
  onReset,
}: {
  rows: RepItem[];
  onGood: (domain: string) => void;
  onBad: (domain: string) => void;
  onDeny: (domain: string) => void;
  onReset: (domain?: string) => void;
}) {
  return (
    <div className="panel">
      <div className="rhead">
        <span>Domain</span>
        <span>α / β</span>
        <span>Utility</span>
        <span className="rhide">Seen</span>
        <span className="rhide">Learned in</span>
        <span className="rhide2">Status</span>
        <span style={{ textAlign: "right" }}>Record</span>
      </div>
      <div id="rep-body">
        {rows.map((r) => {
          const u = (r.a + r.b ? r.a / (r.a + r.b) : 0.5) * 100;
          const cls =
            u >= 65 ? "" : u >= 40 ? "mid" : "low";
          return (
            <div className="rrow" key={r.domain}>
              <span className="dom">
                <span className="mono">{r.domain}</span>
                <span className={`tier ${r.tier}`}>{r.tier}</span>
                {r.denied && (
                  <span className="note" data-testid={`deny-on-${r.domain}`}>
                    denied — hard-dropped at admission
                  </span>
                )}
              </span>
              <span className="ab mono">
                <b>{r.a}</b>/{r.b}
              </span>
              <span>
                <div className="ubar">
                  <i
                    className={cls}
                    style={{ transform: `scaleX(${u / 100})` }}
                  ></i>
                </div>
                <span className="upct">{u.toFixed(0)}%</span>
              </span>
              <span className="seen rhide">{r.seen}</span>
              <span className="apps rhide">fleet</span>
              <span className="rhide2">
                {r.denied ? (
                  <span className="chip r">denied</span>
                ) : (
                  <span className="chip g">live</span>
                )}
              </span>
              <span className="racts" style={{ justifyContent: "flex-end" }}>
                <button
                  className="good"
                  title="good"
                  aria-label={`good ${r.domain}`}
                  onClick={() => onGood(r.domain)}
                >
                  +
                </button>
                <button
                  className="badd"
                  title="bad"
                  aria-label={`bad ${r.domain}`}
                  onClick={() => onBad(r.domain)}
                >
                  −
                </button>
                <button
                  className={`deny${r.denied ? " on" : ""}`}
                  title="deny"
                  aria-label={`deny ${r.domain}`}
                  data-testid={`deny-${r.domain}`}
                  onClick={() => onDeny(r.domain)}
                >
                  ⛔
                </button>
                <button
                  title="reset"
                  aria-label={`reset ${r.domain}`}
                  onClick={() => onReset(r.domain)}
                >
                  ↺
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="rep-foot">
        <b>Cross-app by construction:</b> one SQLite table, written by the
        sidecar, read by the plugin. Mark a domain bad here and every request
        behind the gateway feels it on the next scoring pass. Deny
        hard-blocks at admission.{" "}
        <button className="btn xs" onClick={() => onReset(undefined)}>
          Reset all
        </button>
      </div>
    </div>
  );
}

export default function SourcesSection({
  rows,
  onChanged,
}: {
  rows: RepItem[] | null;
  onChanged: () => void;
}) {
  async function vote(domain: string, verdict: "good" | "bad") {
    await api.feedback(domain, verdict);
    onChanged();
  }

  async function deny(domain: string) {
    // Real and cross-request: the sidecar persists Denied, so the next
    // admission from this domain drops with authority_denied.
    await api.deny(domain, true);
    onChanged();
  }

  async function reset(domain?: string) {
    await api.resetRep(domain);
    onChanged();
  }

  if (rows === null) return <p className="lede">Loading…</p>;
  if (rows.length === 0)
    return (
      <p className="lede">
        No feedback recorded yet — the table fills when a domain receives
        feedback.
      </p>
    );

  return (
    <SourcesTable
      rows={rows}
      onGood={(d) => void vote(d, "good")}
      onBad={(d) => void vote(d, "bad")}
      onDeny={(d) => void deny(d)}
      onReset={(d) => void reset(d)}
    />
  );
}
