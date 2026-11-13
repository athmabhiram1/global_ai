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
        <span className="rhide">Learned in</span>
        <span style={{ textAlign: "right" }}>Record</span>
      </div>
      <div id="rep-body">
        {rows.map((r) => {
          const u = r.a + r.b ? r.a / (r.a + r.b) : 0.5;
          const cls =
            u >= 0.65 ? "" : u >= 0.4 ? "mid" : "low";
          return (
            <div className="rrow" key={r.domain} data-dom={r.domain}>
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
                α <b>{r.a}</b> · β <b>{r.b}</b>
              </span>
              <span>
                <div className="ubar">
                  <i
                    className={cls}
                    style={{ transform: `scaleX(${u.toFixed(3)})` }}
                  ></i>
                </div>
                <span className="upct">{u.toFixed(2)}</span>
              </span>
              <span className="apps rhide">{r.apps.join(" · ")}</span>
              <span className="racts">
                <button
                  className="good"
                  title="α += 1"
                  aria-label={`good ${r.domain}`}
                  onClick={() => onGood(r.domain)}
                >
                  +
                </button>
                <button
                  className="badd"
                  title="β += 1"
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
    // Live and cross-request: the sidecar persists Denied, so the next
    // admission from this domain drops with authority_denied. Deny toggles:
    // pressing it on a denied domain releases it again.
    const row = rows?.find((r) => r.domain === domain);
    await api.deny(domain, !(row?.denied ?? false));
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
    <>
      <div className="expl">
        <div className="ex">
          <b>
            Learning <span className="m">α+1 · β+1</span>
          </b>
          <p>Feedback moves the posterior; the scorer reads it next request.</p>
        </div>
        <div className="ex">
          <b>
            Decay <span className="m">0.99 / day</span>
          </b>
          <p>Posteriors fade toward Beta(1, 1).</p>
        </div>
        <div className="ex">
          <b>
            Cross-app <span className="m">1 table · N apps</span>
          </b>
          <p>Deny here hard-blocks everywhere, before any model call.</p>
        </div>
      </div>
      <SourcesTable
        rows={rows}
        onGood={(d) => void vote(d, "good")}
        onBad={(d) => void vote(d, "bad")}
        onDeny={(d) => void deny(d)}
        onReset={(d) => void reset(d)}
      />
    </>
  );
}
