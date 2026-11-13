"use client";

import { useEffect, useState } from "react";
import type { AutopsyResult } from "../../lib/api";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitQuote(quote: string, chunkId: string): (string | { em: string })[] {
  if (!chunkId || !quote.includes(chunkId)) return [quote];
  const parts: (string | { em: string })[] = [];
  const idx = quote.indexOf(chunkId);
  parts.push(quote.slice(0, idx));
  parts.push({ em: chunkId });
  parts.push(quote.slice(idx + chunkId.length));
  return parts;
}

// Pure proof view: replay log, influence count, with/without memos with
// changed-sentence highlighting, meta, and actions. Every line is derived
// strictly from the sidecar result — no transport or storage claims are
// invented. Quote/verdict/meta render only when the sidecar returned them.
export function AutopsyResultView({
  result,
  chunkId,
  requestId,
  onMarkUnreliable,
}: {
  result: AutopsyResult;
  chunkId: string;
  requestId?: string;
  onMarkUnreliable?: (domain: string) => void;
}) {
  const [flagged, setFlagged] = useState(false);
  const withS = result.with_sentences ?? sentences(result.with);
  const withoutS = result.without_sentences ?? sentences(result.without);
  const hot = new Set([
    ...result.diff.changed,
    ...result.diff.added,
    ...result.diff.removed,
  ]);
  const changedIdx = new Set(result.changed_indices ?? []);
  const changedTotal = result.changed_indices?.length ?? result.diff.changed.length;
  const total = result.diff.total || withS.length;
  const isHot = (s: string, i: number) =>
    hot.has(s) || changedIdx.has(i);

  // Count-up on the influence figure; skipped where matchMedia is
  // unavailable (tests) or the user prefers reduced motion.
  const [shown, setShown] = useState(result.influence);
  useEffect(() => {
    const mq =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (!mq || mq.matches) {
      setShown(result.influence);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 800);
      const e = 1 - Math.pow(1 - p, 4);
      setShown(result.influence * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result.influence]);

  const logLines = [
    `▸ ablate ${chunkId} from ${requestId ?? "request"}`,
    `▸ with ${withS.length} sentences · without ${withoutS.length} sentences`,
    `▸ align · ${total} sentences · ${changedTotal} changed`,
    `▸ influence = ${result.influence.toFixed(2)}${result.cached ? " · cached 60 min" : ""}`,
  ];

  return (
    <div aria-label={`Autopsy result for ${chunkId}`}>
      <div id="aut-log" aria-live="polite">
        {logLines.map((l, i) => (
          <div key={i} className={i === logLines.length - 1 ? "hl" : undefined}>
            {l}
          </div>
        ))}
      </div>
      <div className="influ">
        <div className="n" id="aut-influence">
          {shown.toFixed(2)}
        </div>
        <p id="aut-changed">
          influence · {changedTotal} / {total} sentences changed
        </p>
        {result.attribution && <div id="aut-attrib">{result.attribution}</div>}
      </div>
      {result.quote && (
        <p id="aut-quote">
          “
          {splitQuote(result.quote, chunkId).map((part, i) =>
            typeof part === "string" ? (
              <span key={i}>{part}</span>
            ) : (
              <em key={i}>{part.em}</em>
            ),
          )}
          ”
        </p>
      )}
      {result.verdict && <p id="aut-verdict">{result.verdict}</p>}
      <div className="memos">
        <div className="memo badm">
          <header>
            <span className="dot"></span>
            <span id="aut-with-h">with {chunkId}</span>
          </header>
          <div id="aut-with">
            {withS.map((s, i) => (
              <p
                key={i}
                className={isHot(s, i) ? "msent bad" : "msent"}
                data-testid={isHot(s, i) ? "changed-sentence" : undefined}
              >
                <span className="mi">s{i + 1}</span>
                <span className="txt">{s}</span>
                {isHot(s, i) && (
                  <span className="mtag r">← {chunkId}</span>
                )}
              </p>
            ))}
          </div>
        </div>
        <div className="memo goodm">
          <header>
            <span className="dot"></span>
            <span id="aut-without-h">without {chunkId}</span>
          </header>
          <div id="aut-without">
            {withoutS.map((s, i) => (
              <p
                key={i}
                className={isHot(s, i) ? "msent good" : "msent"}
                data-testid={isHot(s, i) ? "changed-sentence" : undefined}
              >
                <span className="mi">s{i + 1}</span>
                <span className="txt">{s}</span>
                {isHot(s, i) && <span className="mtag g">corrected</span>}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div id="aut-meta">
        {result.sample && <span className="samp">{result.sample}</span>}
        {result.chunk_domain && <span>domain {result.chunk_domain}</span>}
        {result.chunk_tokens !== undefined && (
          <span>{result.chunk_tokens} tokens</span>
        )}
        {result.cached && (
          <span className="chip">cached · 60 min TTL</span>
        )}
      </div>
      <div id="aut-actions">
        {result.chunk_domain && onMarkUnreliable && (
          <button
            className="btn sm"
            data-testid="mark-unreliable"
            disabled={flagged}
            onClick={() => {
              onMarkUnreliable(result.chunk_domain!);
              setFlagged(true);
            }}
          >
            {flagged ? "Recorded — fleet-wide" : `Mark ${result.chunk_domain} unreliable`}
          </button>
        )}
      </div>
    </div>
  );
}

export default AutopsyResultView;
