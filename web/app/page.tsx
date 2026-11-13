"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [rows, setRows] = useState<DecisionListItem[]>([]);
  // null = still booting; true/false = sidecar reachable or not
  const [live, setLive] = useState<boolean | null>(null);

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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/console");
      }
    };
    window.addEventListener("keydown", onKey);
    // reveal-on-scroll for [data-reveal], matching the template
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (es) =>
              es.forEach((en) => {
                if (en.isIntersecting) en.target.classList.add("in");
              }),
            { threshold: 0.1 },
          )
        : null;
    document
      .querySelectorAll("[data-reveal]")
      .forEach((el) => io?.observe(el));
    return () => {
      stop = true;
      window.removeEventListener("keydown", onKey);
      io?.disconnect();
    };
    // Mount-once boot: fetch the live ledger, wire ⌘K. Router identity is
    // intentionally not a dep (stable in production, mocked in tests).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = statsOf(rows);
  const booted = live !== null;
  const goTour = () => router.push("/console?tour=1");

  return (
    <main id="pg-landing" className="page active">
      <div id="toasts" role="status" aria-live="polite"></div>
      <header className="lnav">
        <div className="wrap in">
          <Link
            className="logo"
            href="/"
            aria-label="Context Curator home"
          >
            <svg viewBox="0 0 32 34" aria-hidden="true">
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
          </Link>
          <div className="right">
            <button className="btn acc sm" onClick={goTour}>
              <svg className="ic" viewBox="0 0 24 24">
                <path d="M7 5l12 7-12 7z" />
              </svg>{" "}
              Guided tour
            </button>
            <Link className="btn pri sm" href="/console">
              Open console
            </Link>
          </div>
        </div>
      </header>

      <div className="hero-grid wrap">
        <Hero onTour={goTour} />
        <Graph admitted={s.admitted} killed={s.killed} live={live === true} />
      </div>
      <Stats s={s} />

      <footer className="lfoot wrap">
        <span>© 2026 Context Curator — a Bifrost gateway plugin</span>
        <span className="fq">“Which sources are allowed to speak.”</span>
        <span className="sp"></span>
        <span>
          <span
            className={`ok-dot${live === true ? " live" : ""}`}
            id="boot-dot"
          ></span>
          <span id="boot-txt">
            {!booted
              ? "booting…"
              : live
                ? "sidecar connected"
                : "sidecar unreachable — console shows disconnected state"}
          </span>
        </span>
      </footer>
    </main>
  );
}
