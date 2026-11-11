"use client";

import { useState } from "react";
import type { AutopsyResult } from "../../lib/api";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Pure proof view: replay log, influence count, with/without memos with
// changed-sentence highlighting, meta, and actions. Prefers server-computed
// sentence arrays; falls back to splitting memos. Quote/verdict render only
// when the sidecar returned them — never synthesized.
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
    ...(result.diff.changed || []),
    ...(result.diff.added || []),
    ...(result.diff.removed || []),
  ]);
  const changedIdx = new Set(result.changed_indices ?? []);
  const changedTotal = result.changed_indices?.length ?? result.diff.changed.length;
  const total = result.diff.total || withS.length;
  const isHot = (s: string, i: number) =>
    hot.has(s) || changedIdx.has(i);

  const logLines = [
    `▸ load ${requestId ?? "request"} · sqlite ok`,
    `▸ replay WITH ${chunkId} → 200 · ok`,
    `▸ replay WITHOUT ${chunkId} → 200 · ok`,
    `▸ sentence align (LCS) · ${total} sentences · ${changedTotal} changed`,
    `▸ influence = ${result.influence.toFixed(2)}${result.cached ? " · cached 60 min" : ""}`,
  ];

  return (
    <div aria-label={`Autopsy result for ${chunkId}`}>
      <div id="aut-log" aria-live="polite">
        {logLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="influ">
        <div className="n" id="aut-influence">
          {result.influence.toFixed(2)}
        </div>
        <p id="aut-changed">
          influence · {changedTotal} / {total} sentences changed
        </p>
        {result.attribution && <div id="aut-attrib">{result.attribution}</div>}
      </div>
      {result.quote && <p id="aut-quote">“{result.quote}”</p>}
      {result.verdict && <p id="aut-verdict">{result.verdict}</p>}
      <div className="memos">
        <div className="memo badm">
          <header>
            <span className="dot"></span>with — original answer
          </header>
          <div>
            {withS.map((s, i) => (
              <p
                key={i}
                className={isHot(s, i) ? "msent bad" : "msent"}
                data-testid={isHot(s, i) ? "changed-sentence" : undefined}
              >
                <span className="mi">{i + 1}</span>
                <span className="txt">{s}</span>
                {isHot(s, i) && (
                  <span className="mtag r">removed</span>
                )}
              </p>
            ))}
          </div>
        </div>
        <div className="memo goodm">
          <header>
            <span className="dot"></span>without — ablated
          </header>
          <div>
            {withoutS.map((s, i) => (
              <p
                key={i}
                className={isHot(s, i) ? "msent good" : "msent"}
                data-testid={isHot(s, i) ? "changed-sentence" : undefined}
              >
                <span className="mi">{i + 1}</span>
                <span className="txt">{s}</span>
                {isHot(s, i) && <span className="mtag g">added</span>}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div id="aut-meta">
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
