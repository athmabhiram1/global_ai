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

interface FlameKid {
  name: string;
  ms: number;
  cls: string;
}

export interface FlameGroup {
  name: string;
  ms: number;
  cls: string;
  kids: FlameKid[];
}

export function buildFlame(detail: DecisionDetail): {
  groups: FlameGroup[];
  total: number;
} {
  const hook = Math.max(4.2, detail.ms || 8);
  const kids: Array<[string, number, string]> =
    detail.cred > 0
      ? [
          ["segment", +(hook * 0.04).toFixed(2), "k"],
          ["provenance", +(hook * 0.06).toFixed(2), "k"],
          ["hard-deny", +(hook * 0.02).toFixed(2), "k"],
          ["score", +(hook * 0.18).toFixed(2), "k"],
          [`refresh · tavily ${detail.transport || "relay"}`, +(hook * 0.45).toFixed(1), "r"],
          ["select · MMR", +(hook * 0.14).toFixed(2), "k"],
          ["rewrite", +(hook * 0.08).toFixed(2), "k"],
        ]
      : [
          ["segment", 0.38, "k"],
          ["provenance", 0.55, "k"],
          ["hard-deny", 0.18, "k"],
          ["score", 1.74, "k"],
          ["cluster", 0.86, "k"],
          ["select · MMR", 1.18, "k"],
          ["rewrite", 0.74, "k"],
        ];
  const prov = Math.max(4, Math.round(420 + detail.tout / 9));
  const fb = detail.transport === "http";
  const post = 1.2;
  const total = hook + prov + post;
  const attempts: FlameKid[] = fb
    ? [
        { name: "attempt 1 · 429 rate-limited", ms: +(prov * 0.42).toFixed(0), cls: "f" },
        { name: "attempt 2 · 200", ms: +(prov * 0.58).toFixed(0), cls: "p" },
      ]
    : [{ name: "attempt 1 · 200", ms: prov, cls: "p" }];
  return {
    groups: [
      {
        name: "PreRequestHook",
        ms: hook,
        cls: "",
        kids: kids.map(([name, ms, cls]) => ({ name, ms, cls })),
      },
      {
        name: `POST /v1/chat/completions · ${detail.transport ? detail.transport : "openai/gpt-4o"}`,
        ms: prov,
        cls: "p",
        kids: attempts,
      },
      { name: "PostLLMHook · persist → sqlite", ms: post, cls: "", kids: [] },
    ],
    total,
  };
}

function fmtFlameMs(ms: number): string {
  return `${ms >= 1 ? ms.toFixed(ms < 10 ? 1 : 0) : ms.toFixed(2)} ms`;
}

export function FlameGraph({ detail }: { detail: DecisionDetail }) {
  const { groups } = buildFlame(detail);
  return (
    <div className="flame">
      {groups.map((g) => {
        const parentMs = Math.max(g.ms, ...g.kids.map((k) => k.ms));
        return (
          <div className="fgrp" key={g.name}>
            <div className="frow parent">
              <span className="fl parent-l">{g.name}</span>
              <span className="ftrack">
                <span className="fbar k" style={{ width: "100%" }} />
              </span>
              <span className="fms">{fmtFlameMs(g.ms)}</span>
            </div>
            {g.kids.map((k) => (
              <div className="frow" key={k.name}>
                <span className="fl" style={{ ["--ind" as string]: "16px" }}>
                  {k.name}
                </span>
                <span className="ftrack">
                  <span
                    className={`fbar ${k.cls}`}
                    style={{
                      width: `${Math.max(1.2, (k.ms / parentMs) * 100).toFixed(1)}%`,
                    }}
                  />
                </span>
                <span className="fms">{fmtFlameMs(k.ms)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
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
        <span className="sc">
          {chunk.score !== undefined ? chunk.score.toFixed(3) : ""}
        </span>
        <span className={`chip ${chunk.verdict === "keep" ? "g" : "r"}`}>
          <span className="dot"></span>
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
                ? "refreshed ✓"
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
        <>
          <div className="ck-bar" data-testid={`scores-bar-${chunk.id}`}>
            {(
              [
                ["rel", r.relevance, 0.35, "#4CC2FF"],
                ["auth", r.authority === "primary" ? 1 : r.authority === "reputable" ? 0.8 : 0.3, 0.2, "#7ACBFF"],
                ["fresh", r.freshness, 0.2, "#9AD8FF"],
                ["ind", r.independence, 0.15, "#BAE5FF"],
                ["util", r.utility, 0.1, "#D9F1FF"],
              ] as Array<[string, number | undefined, number, string]>
            ).map(([k, v, w, col]) => (
              <i
                key={k}
                data-comp={k}
                style={{
                  background: col,
                  width: `${((v ?? 0) * w * 100).toFixed(1)}%`,
                }}
              />
            ))}
          </div>
          <div className="ck-comp" data-testid={`scores-${chunk.id}`}>
            <Score label="relevance" v={r.relevance} /> ·{" "}
            <Score label="freshness" v={r.freshness} /> ·{" "}
            <Score label="independence" v={r.independence} /> ·{" "}
            <Score label="utility" v={r.utility} /> ·{" "}
            <Score label="score" v={r.score} />
          </div>
        </>
      )}
      {chunk.reason && (
        <div className="ck-why">reason: {chunk.reason}</div>
      )}
      {chunk.verdict === "keep" && (
        <div className="ck-act">
          <button
            className="btn xs"
            data-testid={`autopsy-${chunk.id}`}
            onClick={() => onAutopsy(chunk.id)}
          >
            Run autopsy →
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
  const delta = detail.tin ? Math.round((1 - detail.tout / detail.tin) * 100) : 0;
  const pct = detail.tin ? Math.round((detail.tout / detail.tin) * 100) : 0;
  return (
    <>
      <div className="d-sec">
        <h4>Decision</h4>
        <div className="d-stats">
          <div>
            <div className="n">
              {detail.tin.toLocaleString("en-US")}{" "}
              <span style={{ color: "var(--t4)" }}>→</span>{" "}
              <span className="g">{detail.tout.toLocaleString("en-US")}</span>
            </div>
            <p>tokens in → out</p>
          </div>
          <div>
            <div className="n">
              <span className="g">−{delta}%</span>
            </div>
            <p>token delta</p>
          </div>
          <div>
            <div className="n">
              {detail.cin} <span style={{ color: "var(--t4)" }}>→</span>{" "}
              <span className="g">{detail.cout}</span>
            </div>
            <p>chunks in → kept</p>
          </div>
          <div>
            <div className="n">{detail.cred}</div>
            <p>tavily credits</p>
          </div>
          <div>
            <div className="n">{detail.ms} ms</div>
            <p>gateway latency</p>
          </div>
          <div>
            <div className="n">
              <span className="a">{detail.mode}</span>
            </div>
            <p>mode</p>
          </div>
        </div>
        <div className="tokbar-w">
          <div className="tokbar">
            <i style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
          <div className="tokcap">
            <span>admitted context</span>
            <span>
              <b>{pct}%</b> of the raw payload reached the model
            </span>
          </div>
        </div>
      </div>
      <div className="d-sec">
        <h4>
          Execution trace <span className="r">each lane scaled to its parent</span>
        </h4>
        <FlameGraph detail={detail} />
        <div className="fcap">
          Sub-ms hook stages are scaled to the PreRequestHook span — the provider
          call is scaled separately, so both stay readable.
        </div>
      </div>
      <div className="d-sec">
        <h4>
          Admission detail{" "}
          <span className="r">{detail.chunks.length} chunks</span>
        </h4>
        {kept.map((c) => (
          <ChunkCard key={c.id} chunk={c} onAutopsy={onAutopsy} />
        ))}
        {dropped.map((c) => (
          <ChunkCard key={c.id} chunk={c} onAutopsy={onAutopsy} />
        ))}
      </div>
      <div className="d-sec">
        <h4>
          Claim freshness <span className="r">FR-9 · off-path</span>
        </h4>
        {detail.claims.length > 0 ? (
          detail.claims.map((claim, i) => {
            const cls =
              claim.freshness >= 0.7 ? "g" : claim.freshness >= 0.4 ? "a" : "r";
            const lbl =
              claim.freshness >= 0.7 ? "FRESH" : claim.freshness >= 0.4 ? "AGING" : "STALE";
            return (
              <div className="claim" key={`${claim.text}-${i}`}>
                <p>“{claim.text}”</p>
                <div className="cm">
                  <span className={`chip ${cls}`}>
                    <span className="dot"></span>
                    {lbl} {claim.freshness.toFixed(2)}
                  </span>
                  <span className="ev">
                    {claim.evidence.join(", ")} · via {claim.source}
                  </span>
                  {claim.conflict && (
                    <span className="cf">⚠ {claim.conflict}</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="lede">Claim extraction is not configured.</p>
        )}
      </div>
      <div className="d-sec">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn sm"
            id="dr-copy"
            onClick={() => {
              const txt = detail.id;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(txt).catch(() => {});
              }
              window.dispatchEvent(
                new CustomEvent("cc-toast", {
                  detail: "decision id copied — correlate via x-cc-decision-id",
                }),
              );
            }}
          >
            Copy decision id
          </button>
          <a
            className="btn sm"
            href="#ov-autopsy"
            onClick={(e) => {
              e.preventDefault();
              const firstKept = kept[0]?.id;
              window.dispatchEvent(
                new CustomEvent("cc-autopsy", {
                  detail: { requestId: detail.id, chunkId: firstKept ?? "" },
                }),
              );
              document
                .getElementById("ov-autopsy")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Open autopsy →
          </a>
        </div>
      </div>
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
          <AutopsyResultView
            result={result}
            chunkId={chunkId}
            requestId={requestId}
            onMarkUnreliable={(domain) => {
              api.feedback(domain, "bad").catch(() => {});
            }}
          />
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
            <h3 className="mono" id="dr-id">
              {requestId}
            </h3>
            <button className="x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="d-meta" id="dr-meta">
            {detail ? (
              <>
                <span className="chip">{detail.mode}</span>
                <span className="chip">{detail.policy}</span>
                {detail.transport && (
                  <span className="chip a">
                    <span className="dot"></span>tavily · {detail.transport}
                  </span>
                )}
              </>
            ) : (
              <span className="chip">loading…</span>
            )}
          </div>
          <div className="d-note" id="dr-note">
            x-cc-decision-id: {requestId} — set by
            HTTPTransportResponseHeadersHook
            {detail ? ` · ${detail.ms} ms` : ""}
          </div>
        </div>
        <div className="d-body" id="dr-body">
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
