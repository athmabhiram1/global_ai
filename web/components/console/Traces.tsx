"use client";

import { useMemo, useState } from "react";
import type { DecisionListItem } from "../../lib/api";
import { OverviewKPIs, MeasuredStrip, ledgerStats } from "./Overview";

export function TracesTable({
  rows,
  onOpen,
}: {
  rows: DecisionListItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-h">
        <b>decisions</b>
        <span className="cnt" id="led-count">
          {rows.length} rows
        </span>
      </div>
      <div className="thead">
        <span>Time</span>
        <span>Request</span>
        <span className="lhide">Policy</span>
        <span>Chunks</span>
        <span>Tokens</span>
        <span className="lhide lhide2">Cr</span>
        <span className="lhide lhide2">p95</span>
        <span style={{ textAlign: "right" }}>Status</span>
      </div>
      <div className="tbody" id="ledger-body" role="list" tabIndex={0}>
        {rows.map((d) => (
          <div
            key={d.id}
            className="trow"
            role="listitem"
            tabIndex={0}
            onClick={() => onOpen(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(d.id);
            }}
          >
            <span className="tm">{d.t}</span>
            <span className="rq">
              <b className="mono">{d.id}</b>
              <em>{d.app}</em>
            </span>
            <span className="lhide">{d.policy}</span>
            <span>
              <span className="kept">{d.cout}</span>
              <span className="arr">/{d.cin}</span>
            </span>
            <span>
              {d.tin}→{d.tout}
            </span>
            <span className="lhide lhide2">{d.cred}</span>
            <span className="lhide lhide2">{d.ms} ms</span>
            <span className="st" style={{ justifyContent: "flex-end" }}>
              {d.reasons.length > 0 ? (
                <span className="a">
                  <span className="dot"></span>
                  {d.reasons[0]}
                </span>
              ) : (
                <span className="g">
                  <span className="dot"></span>admitted
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TracesTelemetry({ rows }: { rows: DecisionListItem[] }) {
  const s = ledgerStats(rows);
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const reason of r.reasons) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
    const total = Math.max(
      1,
      rows.reduce((n, r) => n + r.reasons.length, 0),
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([reason, n]) => ({ reason, pct: Math.round((n / total) * 100) }));
  }, [rows]);
  return (
    <div className="tel-row">
      <div className="tel">
        <h5>
          Chunks <b>this session</b>
        </h5>
        <div className="big">
          <span className="g" data-testid="tel-admitted">
            {s.admitted}
          </span>{" "}
          <span style={{ color: "var(--t4)" }}>/</span>{" "}
          <span className="r" data-testid="tel-killed">
            {s.killed}
          </span>
        </div>
        <div
          style={{
            font: "400 10px var(--mono)",
            color: "var(--t4)",
            marginTop: 5,
          }}
        >
          admitted / killed
        </div>
      </div>
      <div className="tel">
        <h5>
          Kills by reason <b>top 4</b>
        </h5>
        <div id="reason-bars">
          {top.length === 0 && (
            <span
              style={{
                font: "400 10px var(--mono)",
                color: "var(--t4)",
              }}
            >
              no kills recorded
            </span>
          )}
          {top.map((t) => (
            <div className="rbar" key={t.reason}>
              <span>{t.reason}</span>
              <div className="tr">
                <i style={{ transform: `scaleX(${t.pct / 100})` }}></i>
              </div>
              <b>{t.pct}%</b>
            </div>
          ))}
        </div>
      </div>
      <div className="tel">
        <h5>Now processing</h5>
        <div className="big" style={{ fontSize: 15, lineHeight: 1.7 }} id="hook-live">
          <b>PreRequestHook</b> idle
        </div>
        <div
          style={{ font: "400 10px var(--mono)", color: "var(--t4)", marginTop: 5 }}
        >
          credits spent ·{" "}
          <span style={{ color: "var(--amber)" }} data-testid="tel-credits">
            {s.credits}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TracesSection({
  rows,
  onOpen,
}: {
  rows: DecisionListItem[] | null;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.id.toLowerCase().includes(needle) ||
        r.policy.toLowerCase().includes(needle) ||
        r.mode.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  if (rows === null) return <p className="lede">Loading…</p>;
  if (rows.length === 0)
    return <p className="lede">No admissions recorded yet.</p>;

  return (
    <>
      <TracesTelemetry rows={rows} />
      <div style={{ margin: "12px 0" }}>
        <input
          aria-label="Filter decisions"
          placeholder="Filter by request, policy, mode…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            background: "var(--bg1)",
            border: "1px solid var(--line2)",
            borderRadius: 8,
            color: "var(--t1)",
            padding: "8px 12px",
            width: "100%",
            maxWidth: 420,
            font: "400 13px var(--sans)",
          }}
        />
      </div>
      {filtered !== null && filtered.length === 0 ? (
        <p className="lede">No admissions match this filter.</p>
      ) : (
        filtered && <TracesTable rows={filtered} onOpen={onOpen} />
      )}
      <OverviewKPIs rows={rows} />
      <MeasuredStrip />
    </>
  );
}
