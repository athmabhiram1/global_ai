"use client";

import { useEffect, useState } from "react";
import { mapDecisions, type DecisionListItem } from "../lib/api";
import { cutPct, MIN_SAMPLE, p95, reasonShare } from "../lib/format";
import Hero from "../components/landing/Hero";
import Graph from "../components/landing/Graph";
import Stats from "../components/landing/Stats";

function statsOf(rows: DecisionListItem[]) {
  const admitted = rows.reduce((s, r) => s + r.cout, 0);
  const killed = rows.reduce((s, r) => s + (r.cin - r.cout), 0);
  const tin = rows.reduce((s, r) => s + r.tin, 0);
  const tout = rows.reduce((s, r) => s + r.tout, 0);
  return {
    admitted,
    killed,
    p95ms: p95(rows.map((r) => r.ms)),
    cut: tin > 0 ? cutPct(tin, tout) : null,
    reasonShare: reasonShare(rows.flatMap((r) => r.reasons)),
    enough: rows.length >= MIN_SAMPLE,
  };
}

export default function Landing() {
  const [rows, setRows] = useState<DecisionListItem[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stop = false;
    fetch("/api/cc/api/context-curator/decisions", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!stop) {
          setRows(mapDecisions(d));
          setLive(true);
        }
      })
      .catch(() => {
        if (!stop) setLive(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  const s = statsOf(rows);

  return (
    <main id="pg-landing" className="page active">
      <header className="lnav">
        <div className="wrap in">
          <a className="logo" href="/" aria-label="Context Curator home">
            <svg className="logo-svg" viewBox="0 0 32 34" aria-hidden="true">
              <path
                d="M16 2 L29 9.5 V24.5 L16 32 L3 24.5 V9.5 Z"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <path
                d="M10 16.5 L14 20.5 L22.5 11"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <b>Context Curator</b>
            <small>v2</small>
          </a>
          <nav aria-label="Sections">
            <button
              onClick={() => (location.href = "/console#ov-traces")}
            >
              Traces
            </button>
            <button onClick={() => (location.href = "/console#ov-autopsy")}>
              Autopsy
            </button>
            <button onClick={() => (location.href = "/console#ov-sources")}>
              Sources
            </button>
            <button onClick={() => (location.href = "/console#ov-policy")}>
              Policy
            </button>
          </nav>
          <div className="right">
            <a className="btn pri" href="/console">
              Open console
            </a>
          </div>
        </div>
      </header>

      <Hero />
      <Graph admitted={s.admitted} killed={s.killed} live={live} />
      <Stats s={s} />

      <footer className="lfoot">
        <span>© 2026 Context Curator — a Bifrost gateway plugin</span>
        <span className="fq">
          “Compression asks how few tokens. We ask which sources are allowed to
          speak.”
        </span>
        <span className="sp"></span>
        <span>
          <span
            className={`ok-dot${live ? " live" : ""}`}
            id="boot-dot"
          ></span>
          <span id="boot-txt">
            {live ? "sidecar connected" : "sidecar unreachable — console shows disconnected state"}
          </span>
        </span>
      </footer>
    </main>
  );
}
