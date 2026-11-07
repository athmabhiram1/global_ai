"use client";

import type { AutopsyResult } from "../../lib/api";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Pure proof view: with/without memos with changed-sentence highlighting.
// Prefers server-computed sentence arrays; falls back to splitting memos.
export function AutopsyResultView({
  result,
  chunkId,
}: {
  result: AutopsyResult;
  chunkId: string;
}) {
  const withS = result.with_sentences ?? sentences(result.with);
  const withoutS = result.without_sentences ?? sentences(result.without);
  const hot = new Set([
    ...(result.diff.changed || []),
    ...(result.diff.added || []),
    ...(result.diff.removed || []),
  ]);
  const changedIdx = new Set(result.changed_indices ?? []);
  const isHot = (s: string, i: number) =>
    hot.has(s) || changedIdx.has(i);

  return (
    <div aria-label={`Autopsy result for ${chunkId}`}>
      <p className="mb-2">
        influence <span className="mono">{result.influence.toFixed(2)}</span>{" "}
        {result.cached && (
          <span className="chip">cached · 60 min TTL</span>
        )}
      </p>
      {result.attribution && <p id="aut-attrib">{result.attribution}</p>}
      <p className="mb-2">
        {result.diff.changed.length} / {result.diff.total} sentences changed
      </p>
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
      </div>
    </div>
  );
}

export default AutopsyResultView;
