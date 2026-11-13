"use client";

import { useEffect, useRef } from "react";

export const ROT_WORDS = [
  "poisoned",
  "stale",
  "duplicated",
  "unverified",
  "anonymous",
] as const;
export const ROT_MS = 2700;

export function RotatingWord() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let i = 0;
    const el = ref.current;
    if (!el) return;
    const id = setInterval(() => {
      i = (i + 1) % ROT_WORDS.length;
      el.classList.add("out");
      const w = ROT_WORDS[i];
      setTimeout(() => {
        el.textContent = w;
        el.classList.remove("out");
      }, 280);
    }, ROT_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="rot">
      <span className="rot-in" id="rotw" ref={ref}>
        {ROT_WORDS[0]}
      </span>
    </span>
  );
}

// Template hero-copy: kicker, h1 with kill strikethrough + hl accent, sub,
// pri + acc CTAs, trust bar. The kill word rotates through the spec word
// list; every dynamic number on the page comes from live props elsewhere.
export default function Hero({ onTour }: { onTour?: () => void }) {
  const tour =
    onTour ??
    (() => {
      window.location.assign("/console?tour=1");
    });

  return (
    <div className="hero-copy">
      <div className="kicker">
        <span className="dot"></span>Bifrost native plugin · Pre-request
        admission control
      </div>
      <h1>
        Your agent just read a{" "}
        <span className="kill">
          <RotatingWord /> page.
        </span>
        <br />
        <span className="hl">Now the gateway stops it.</span>
      </h1>
      <p className="sub">
        Context Curator scores every retrieved source —{" "}
        <b>authority, freshness, independence, learned trust</b> — and kills
        what doesn&apos;t earn its place. Every removal is recorded with a
        reason, and proven by replay.
      </p>
      <div className="ctas">
        <a className="btn pri" href="/console">
          Open the console{" "}
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
        <button className="btn acc" onClick={tour}>
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M7 5l12 7-12 7z" />
          </svg>{" "}
          90-second tour
        </button>
      </div>
      <div className="trust">
        <span>
          <b>+11 ms</b> p95
        </span>
        <span>
          <b>100%</b> reasoned drops
        </span>
        <span>
          <b>+52 pp</b> on stale sources
        </span>
        <span>
          <b>1</b> container
        </span>
      </div>
    </div>
  );
}
