"use client";

import { useEffect, useMemo, useState } from "react";
import type { DecisionListItem } from "../../lib/api";
import { ledgerStats } from "./Overview";

const HOOK_STAGES = [
  "segment",
  "provenance",
  "hard-deny",
  "score",
  "refresh",
  "select · MMR",
  "rewrite ✓ committed",
];

function HookLive() {
  const [stage, setStage] = useState(-1);
  useEffect(() => {
    let i = 0;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const nx = () => {
      if (!alive) return;
      if (i < HOOK_STAGES.length) {
        setStage(i);
        i += 1;
        t = setTimeout(nx, 110);
      } else {
        t = setTimeout(() => {
          if (!alive) return;
          setStage(HOOK_STAGES.length);
          i = 0;
          t = setTimeout(nx, 2400);
        }, 1400);
      }
    };
    nx();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return (
    <div className="big" style={{ fontSize: 15, lineHeight: 1.7 }} id="hook-live">
      <b>PreRequestHook</b>{" "}
      {stage < 0
        ? "idle"
        : stage >= HOOK_STAGES.length
          ? "committed — every fallback inherits the rewrite"
          : HOOK_STAGES.slice(Math.max(0, stage - 2), stage + 1).join(" → ")}
    </div>
  );
}

export function TracesTable({
  rows,
  onOpen,
}: {
  rows: DecisionListItem[];
  onOpen: (id: string) => void;
}) {
  const mode = rows.length > 0 ? rows[0].mode : "rewrite";
  return (
    <div className="panel">
      <div className="panel-h">
        <b>decisions</b>
        <span className="cnt" id="led-count">
          {rows.length} of {rows.length} rows
        </span>
        <div className="right">
          <span className="chip" id="mode-banner">
            <span className="dot"></span>mode: {mode}
          </span>
        </div>
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
        {rows.map((d) => {
          const killed = d.cin - d.cout;
          return (
            <div
              key={d.id}
              className="trow"
              role="listitem"
              tabIndex={0}
              data-id={d.id}
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
                {killed > 0 && (
                  <span className="r">
                    <span className="dot"></span>
                    {killed} killed
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TracesTelemetry({ rows }: { rows: DecisionListItem[] }) {
  const s = ledgerStats(rows);
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows)
      for (const reason of r.reasons) {
        counts.set(reason, (counts.get(reason) || 0) + 1);
      }
    const total = Math.max(
      1,
      rows.reduce((n, r) => n + r.reasons.length, 0),
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([reason, n]) => ({ reason, pct: Math.round((n / total) * 100), n }));
  }, [rows]);
  const max = Math.max(1, ...top.map((t) => t.n));
  return (
    <div className="tel-row">
      <div className="tel">
        <h5>
          Chunks <b>this session</b>
        </h5>
        <div className="big">
          <span className="g" id="t-adm" data-testid="tel-admitted">
            {s.admitted}
          </span>{" "}
          <span style={{ color: "var(--t4)" }}>/</span>{" "}
          <span className="r" id="t-rej" data-testid="tel-killed">
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
                <i style={{ transform: `scaleX(${t.n / max})` }}></i>
              </div>
              <b>{t.n}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="tel">
        <h5>Now processing</h5>
        <HookLive />
        <div
          style={{ font: "400 10px var(--mono)", color: "var(--t4)", marginTop: 5 }}
        >
          credits spent ·{" "}
          <span style={{ color: "var(--amber)" }} id="t-cred" data-testid="tel-credits">
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
  if (rows === null) return <p className="lede">Loading…</p>;
  if (rows.length === 0)
    return <p className="lede">No admissions recorded yet.</p>;

  return (
    <>
      <TracesTelemetry rows={rows} />
      <TracesTable rows={rows} onOpen={onOpen} />
    </>
  );
}
