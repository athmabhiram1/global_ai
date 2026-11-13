"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export const ROT_WORDS = [
  "stale",
  "poisoned",
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

// Centered hero per the template: eyebrow pill, h1 with the rotating word,
// sub copy, then "Open the console" + "Connect your sidecar" CTAs. No dynamic
// numbers here — live totals stay in the graph pill + console.
export default function Hero() {
  return (
    <section className="hero">
      <span className="eyebrow">
        <span className="dot"></span>BIFROST NATIVE PLUGIN · ADMISSION CONTROL
      </span>
      <h1>
        Your agent just read a<br />
        <RotatingWord /> page.<br />
        The gateway has an opinion now.
      </h1>
      <p className="sub">
        Context Curator performs <b>admission control on context</b> — every
        retrieved chunk is scored on authority, freshness, independence and
        learned utility; only what earns its place reaches the model; every
        rejection is recorded with a reason code. Prove any decision by
        removing the chunk and replaying the request.
      </p>
      <div className="hero-ctas">
        <Link className="btn pri" href="/console">
          Open the console{" "}
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
        <Link className="lnk" href="/console">
          Connect your sidecar
        </Link>
        <span className="or">
          or press{" "}
          <Link href="/console" aria-label="Open console with command palette">
            <kbd>⌘K</kbd>
          </Link>
        </span>
      </div>
    </section>
  );
}
