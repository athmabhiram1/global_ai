"use client";

import { useEffect, useMemo, useState } from "react";
import {
  api,
  mapDetail,
  type AutopsyResult,
  type DecisionListItem,
  type DecisionRow,
} from "../../lib/api";
import { AutopsyResultView } from "./Autopsy";

// Counterfactual replay against the live ledger. Pick a retained chunk of a
// recent decision; the sidecar replays with/without it. Dropped chunks are
// rejected by the API ("not retained") and the error shows verbatim.
export default function AutopsySection({
  rows,
}: {
  rows: DecisionListItem[] | null;
}) {
  const [decisionId, setDecisionId] = useState("");
  const [chunks, setChunks] = useState<
    { id: string; verdict: string; reason?: string }[]
  >([]);
  const [chunkId, setChunkId] = useState("");
  const [result, setResult] = useState<AutopsyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const ids = useMemo(() => (rows || []).map((r) => r.id), [rows]);
  useEffect(() => {
    if (!decisionId && ids.length > 0) setDecisionId(ids[0]);
  }, [ids, decisionId]);

  useEffect(() => {
    if (!decisionId) return;
    setChunks([]);
    setChunkId("");
    setResult(null);
    setError(null);
    api
      .decisionRows()
      .then((all: DecisionRow[]) => {
        const row = all.find((d) => d.request_id === decisionId);
        if (!row) {
          setError(`Decision ${decisionId} not found in the ledger.`);
          return;
        }
        const detail = mapDetail(row);
        setChunks(
          detail.chunks.map((c) => ({
            id: c.id,
            verdict: c.verdict,
            reason: c.reason,
          })),
        );
        const firstKept = detail.chunks.find((c) => c.verdict === "keep");
        if (firstKept) setChunkId(firstKept.id);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, [decisionId]);

  async function run() {
    if (!decisionId || !chunkId) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await api.autopsy(decisionId, chunkId));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // A dropped chunk was never retained, so there is nothing to ablate:
      // surface the API's refusal verbatim instead of inventing a replay.
      // Only genuine transport/replayer failures get the unavailable label.
      setError(
        /not[\s_-]?retained/i.test(msg) || /was killed at admission/i.test(msg)
          ? msg
          : /replay|replayer|gateway|upstream|502|503/i.test(msg)
            ? `Replay is unavailable: ${msg}`
            : msg,
      );
    } finally {
      setRunning(false);
    }
  }

  if (rows === null) return <p className="lede">Loading…</p>;
  if (rows.length === 0)
    return <p className="lede">No admissions recorded yet.</p>;

  return (
    <div className="aut-grid">
      <div>
        <div
          style={{
            font: "500 9.5px var(--mono)",
            letterSpacing: ".1em",
            color: "var(--t4)",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Ablation target
        </div>
        <label className="mono" style={{ fontSize: 11 }}>
          decision{" "}
          <select
            aria-label="Decision"
            value={decisionId}
            onChange={(e) => setDecisionId(e.target.value)}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <div className="achips" id="aut-chips" style={{ marginTop: 8 }}>
          {chunks.map((c) => (
            <button
              key={c.id}
              className={`achip${chunkId === c.id ? " on" : ""}`}
              data-testid={`ablate-${c.id}`}
              onClick={() => {
                setChunkId(c.id);
                setResult(null);
                setError(null);
              }}
            >
              {c.id}
              {c.verdict === "drop" ? " ✕" : ""}
            </button>
          ))}
        </div>
        <div id="aut-card">
          {chunkId ? (
            <>
              target <b className="dm">{chunkId}</b> ·{" "}
              {chunks.find((c) => c.id === chunkId)?.verdict === "drop"
                ? "dropped — the API will refuse (not retained)"
                : "retained — replay removes it once"}
            </>
          ) : (
            "pick a chunk"
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn"
            onClick={run}
            disabled={running || !chunkId}
            data-testid="autopsy-run"
          >
            {running ? "Replaying…" : "Run ablation"}
          </button>
        </div>
        {error && (
          <p className="memo badm" role="alert" style={{ marginTop: 12 }}>
            {error}{" "}
            <button className="btn ml-2" onClick={run}>
              Retry
            </button>
          </p>
        )}
      </div>
      <div>
        {result ? (
          <AutopsyResultView
            result={result}
            chunkId={chunkId}
            requestId={decisionId}
            onMarkUnreliable={(domain) => {
              api.feedback(domain, "bad").catch(() => {});
            }}
          />
        ) : (
          !error && (
            <div className="aut-empty">
              No ablation yet — pick a retained chunk and run it.
            </div>
          )
        )}
      </div>
    </div>
  );
}
