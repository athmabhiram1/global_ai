"use client";

import { useEffect, useRef } from "react";

const WORDS = ["poisoned", "stale", "spammy", "conflicted", "bloated"];

export function RotatingWord() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let i = 0;
    const el = ref.current;
    if (!el) return;
    const id = setInterval(() => {
      i = (i + 1) % WORDS.length;
      el.classList.add("out");
      const w = WORDS[i];
      setTimeout(() => {
        el.textContent = w;
        el.classList.remove("out");
      }, 280);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="rot">
      <span className="rot-in" id="rotw" ref={ref}>
        {WORDS[0]}
      </span>
    </span>
  );
}

export default function Hero() {
  return (
    <div className="hero">
      <span className="eyebrow">
        <span className="dot"></span>BIFROST NATIVE PLUGIN · ADMISSION CONTROL
      </span>
      <h1>
        Your agent just read a<br />
        <RotatingWord /> page.
        <br />
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
        <a className="btn pri" href="/console">
          Open the console{" "}
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
        <a className="btn" href="/console#connect">
          Connect your sidecar
        </a>
        <span className="or">
          or press <kbd>⌘K</kbd>
        </span>
      </div>
    </div>
  );
}
