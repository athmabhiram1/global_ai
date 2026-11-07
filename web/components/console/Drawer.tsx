"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AutopsyResult,
  type ChunkView,
  type DecisionDetail,
} from "../../lib/api";
import { AutopsyResultView } from "./Autopsy";

function Score({ label, v }: { label: string; v: number | undefined }) {
  return (
    <span>
      {label}{" "}
      <b>{v !== undefined && Number.isFinite(v) ? v.toFixed(2) : "—"}</b>
    </span>
  );
}

export function ChunkCard({
  chunk,
  onAutopsy,
}: {
  chunk: ChunkView;
  onAutopsy: (id: string) => void;
}) {
  const r = chunk.record;
  return (
    <div
      className={`ck${chunk.verdict === "drop" ? " drop" : ""}`}
      data-testid={`chunk-${chunk.id}`}
    >
      <div className="ck-h">
        <span className="cid mono">{chunk.id}</span>
        <span className="cdm">{chunk.dom}</span>
        {chunk.score !== undefined ? (
          <span className="sc">{chunk.score.toFixed(3)}</span>
        ) : (
          <span className="sc">—</span>
        )}
        <span className={`chip ${chunk.verdict === "keep" ? "g" : "r"}`}>
          {chunk.verdict === "keep" ? "kept" : "killed"}
        </span>
      </div>
      <div className="ck-m">
        {r ? (
          <>
            <span>domain {r.domain || "—"}</span>
            <span>authority {r.authority || "—"}</span>
            <span>freshness {r.freshness_class || "—"}</span>
            <span>
              age{" "}
              {r.age_hours !== undefined
                ? r.age_hours >= 1
                  ? `${r.age_hours.toFixed(1)} h`
                  : `${Math.max(1, Math.round(r.age_hours * 60))} m`
                : "—"}
            </span>
            <span>tokens {r.tokens ?? "—"}</span>
            <span>cluster {r.cluster_id || "—"}</span>
            {r.cluster_size !== undefined && r.cluster_size > 0 && (
              <span>size {r.cluster_size}</span>
            )}
            <span>provenance {r.provenance || "—"}</span>
            <span className={r.refreshed ? "rf" : r.refresh_failed ? "rff" : ""}>
              {r.refreshed
                ? "refreshed"
                : r.refresh_failed
                  ? "refresh failed"
                  : "not refreshed"}
            </span>
          </>
        ) : (
          <span>ID-only row — recorded before chunk persistence</span>
        )}
      </div>
      {r && (
        <div className="ck-comp" data-testid={`scores-${chunk.id}`}>
          <Score label="relevance" v={r.relevance} /> ·{" "}
          <Score label="freshness" v={r.freshness} /> ·{" "}
          <Score label="independence" v={r.independence} /> ·{" "}
          <Score label="utility" v={r.utility} /> ·{" "}
          <Score label="score" v={r.score} />
        </div>
      )}
      {chunk.reason && (
        <div className="ck-why">killed: {chunk.reason}</div>
      )}
      {chunk.verdict === "keep" && (
        <div className="ck-act">
          <button
            className="btn xs"
            data-testid={`autopsy-${chunk.id}`}
            onClick={() => onAutopsy(chunk.id)}
          >
            autopsy
          </button>
        </div>
      )}
    </div>
  );
}

export function DecisionDrawerView({
  detail,
  onAutopsy,
}: {
  detail: DecisionDetail;
  onAutopsy: (chunkId: string) => void;
}) {
  const kept = detail.chunks.filter((c) => c.verdict === "keep");
  const dropped = detail.chunks.filter((c) => c.verdict === "drop");
  return (
    <>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt>mode</dt>
          <dd>
            <span className="chip">{detail.mode}</span>
          </dd>
        </div>
        <div>
          <dt>policy</dt>
          <dd className="mono">{detail.policy}</dd>
        </div>
        <div>
          <dt>chunks</dt>
          <dd className="mono">
            {detail.cout}/{detail.cin} kept
          </dd>
        </div>
        <div>
          <dt>tokens</dt>
          <dd className="mono">
            {detail.tin}→{detail.tout}
          </dd>
        </div>
        <div>
          <dt>credits</dt>
          <dd className="mono">{detail.cred}</dd>
        </div>
        <div>
          <dt>duration</dt>
          <dd className="mono">{detail.ms} ms</dd>
        </div>
      </dl>
      <h4 className="mb-2 text-sm font-medium">
        Kept <span className="mono">({kept.length})</span>
      </h4>
      <div className="mb-4" data-testid="kept-list">
        {kept.map((c) => (
          <ChunkCard key={c.id} chunk={c} onAutopsy={onAutopsy} />
        ))}
      </div>
      {kept.length === 0 && (
        <p className="lede">Nothing to ablate — every chunk was killed at admission.</p>
      )}
      <h4 className="mb-2 text-sm font-medium">
        Dropped <span className="mono">({dropped.length})</span>
      </h4>
      <div className="mb-4" data-testid="dropped-list">
        {dropped.map((c) => (
          <ChunkCard key={c.id} chunk={c} onAutopsy={onAutopsy} />
        ))}
      </div>
      <h4 className="mb-2 text-sm font-medium">Claim freshness</h4>
      {detail.claims.length > 0 ? (
        <div className="mb-4">
          {detail.claims.map((claim, i) => (
            <div className="claim" key={`${claim.text}-${i}`}>
              <p>{claim.text}</p>
              <div className="cm">
                <span className="ev">evidence: {claim.evidence.join(", ")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="lede">Claim extraction is not configured.</p>
      )}
    </>
  );
}

function AutopsyRunner({
  requestId,
  chunkId,
}: {
  requestId: string;
  chunkId: string;
}) {
  const [result, setResult] = useState<AutopsyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await api.autopsy(requestId, chunkId));
    } catch (e: unknown) {
      // Dropped-chunk rejection ("not retained") and replay failures surface
      // verbatim: no animation, no fake zero-influence score.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [chunkId]);

  return (
    <section aria-label={`Autopsy of ${chunkId}`} className="autopsy">
      <h4 className="mb-2 text-sm font-medium">
        Autopsy <span className="mono">{chunkId}</span>
      </h4>
      {!result && !error && (
        <button className="btn" onClick={run} disabled={running}>
          {running ? "Replaying…" : "Run ablation"}
        </button>
      )}
      {error && (
        <p className="memo badm" role="alert">
          {error}{" "}
          <button className="btn ml-2" onClick={run}>
            Retry
          </button>
        </p>
      )}
      {result && (
        <>
          <AutopsyResultView result={result} chunkId={chunkId} />
          <button className="btn mt-2" onClick={run} disabled={running}>
            {running ? "Replaying…" : "Re-run"}
          </button>
        </>
      )}
    </section>
  );
}

export default function Drawer({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ablate, setAblate] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setAblate(null);
    api
      .decision(requestId)
      .then(setDetail)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, [requestId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div id="scrim" className="open" onClick={onClose} />
      <div
        id="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Decision ${requestId}`}
      >
        <div className="d-head">
          <div className="d-top">
            <h3 className="mono">{requestId}</h3>
            <button className="x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="d-meta">
            {detail && (
              <>
                <span className="chip">{detail.mode}</span>
                <span className="chip">{detail.policy}</span>
              </>
            )}
          </div>
        </div>
        <div className="d-body">
          {error && (
            <p className="memo badm" role="alert">
              {error}
            </p>
          )}
          {!detail && !error && (
            <>
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </>
          )}
          {detail && (
            <>
              <DecisionDrawerView
                detail={detail}
                onAutopsy={(id) =>
                  setAblate((cur) => (cur === id ? null : id))
                }
              />
              {ablate && (
                <AutopsyRunner requestId={requestId} chunkId={ablate} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
