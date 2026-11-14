"use client";

import { useEffect, useRef, useState } from "react";
import {
  api,
  mapDetail,
  type AutopsyResult,
  type DecisionListItem,
  type DecisionRow,
} from "../../lib/api";
import { AutopsyResultView } from "./Autopsy";

// Counterfactual replay against the live ledger, template-style: pick a
// decision chip and a retained chunk chip and the sidecar replays
// with/without it at once. Dropped chunks are rejected by the API
// ("not retained") and the error shows verbatim.
const MAX_DECISION_CHIPS = 12;

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

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
  const ranRef = useRef("");
  const [runNonce, setRunNonce] = useState(0);
  // Handoff from the decision drawer ("Open autopsy →"): the event may arrive
  // before, with, or instead of a decision change, so the wanted chunk waits
  // here until the detail for the requested decision loads.
  const pendingChunkRef = useRef<string | null>(null);
  const liveRef = useRef({
    decisionId: "",
    chunkIds: [] as string[],
    chunkId: "",
    hasResult: false,
  });
  useEffect(() => {
    liveRef.current = {
      decisionId,
      chunkIds: chunks.map((c) => c.id),
      chunkId,
      hasResult: result !== null,
    };
  });

  const ids = (rows || []).map((r) => r.id);
  const shownIds = ids.slice(0, MAX_DECISION_CHIPS);
  const hiddenCount = ids.length - shownIds.length;

  useEffect(() => {
    if (!decisionId && ids.length > 0) setDecisionId(ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, decisionId]);

  useEffect(() => {
    if (!decisionId) return;
    ranRef.current = "";
    setChunks([]);
    setChunkId("");
    setResult(null);
    setError(null);
    let live = true;
    api
      .decisionRows()
      .then((all: DecisionRow[]) => {
        if (!live) return;
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
        const wanted = pendingChunkRef.current;
        pendingChunkRef.current = null;
        const firstKept = detail.chunks.find((c) => c.verdict === "keep");
        const target =
          (wanted && detail.chunks.some((c) => c.id === wanted)
            ? wanted
            : firstKept?.id) ?? "";
        if (target) setChunkId(target);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      live = false;
    };
  }, [decisionId]);

  // Drawer handoff: { requestId, chunkId } selects that decision and runs the
  // requested chunk through the normal autorun path below.
  useEffect(() => {
    const onAuto = (e: Event) => {
      const d = (e as CustomEvent<{ requestId?: string; chunkId?: string }>)
        .detail;
      if (!d?.requestId) return;
      const live = liveRef.current;
      if (d.requestId === live.decisionId && live.chunkIds.includes(d.chunkId ?? "")) {
        // Already showing exactly this proof: leave it on screen.
        if (d.chunkId === live.chunkId && live.hasResult) return;
        // Same decision, no visible result: force a replay instead of relying
        // on a chunkId change that may already equal the current one.
        ranRef.current = "";
        setResult(null);
        setError(null);
        setChunkId(d.chunkId as string);
        setRunNonce((n) => n + 1);
        return;
      }
      pendingChunkRef.current = d.chunkId ?? null;
      setDecisionId(d.requestId);
    };
    window.addEventListener("cc-autopsy", onAuto);
    return () => window.removeEventListener("cc-autopsy", onAuto);
  }, []);

  async function run(reqId: string, ckId: string) {
    setRunning(true);
    setError(null);
    try {
      setResult(await api.autopsy(reqId, ckId));
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

  // Autorun like the template: selecting a target replays it. Polling
  // refreshes rows but never changes decisionId/chunkId, so this fires
  // once per selection, not once per poll.
  useEffect(() => {
    if (!decisionId || !chunkId || running) return;
    const key = `${decisionId}:${chunkId}`;
    if (ranRef.current === key) return;
    ranRef.current = key;
    void run(decisionId, chunkId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, chunkId, running, runNonce]);

  if (rows === null) return <p className="lede">Loading…</p>;
  if (rows.length === 0)
    return <p className="lede">No admissions recorded yet.</p>;

  const keptCount = chunks.filter((c) => c.verdict === "keep").length;

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
        <div
          className="achips"
          role="group"
          aria-label="Decision"
          style={{ marginBottom: 8 }}
        >
          {shownIds.map((id) => (
            <button
              key={id}
              className={`achip${decisionId === id ? " on" : ""}`}
              data-testid={`target-${id}`}
              title={id}
              aria-label={`Decision ${id}`}
              onClick={() => {
                setDecisionId(id);
              }}
            >
              {shortId(id)}
            </button>
          ))}
        </div>
        {hiddenCount > 0 && (
          <p className="why" style={{ marginTop: 0 }}>
            +{hiddenCount} more in traces
          </p>
        )}
        <div className="achips" id="aut-chips" style={{ marginTop: 8 }}>
          {chunks.map((c) => (
            <button
              key={c.id}
              className={`achip${chunkId === c.id ? " on" : ""}`}
              data-testid={`ablate-${c.id}`}
              disabled={running}
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
          ) : chunks.length > 0 && keptCount === 0 ? (
            "no retained chunks — every chunk was killed at admission"
          ) : (
            "pick a chunk"
          )}
        </div>
        {error && (
          <p className="memo badm" role="alert" style={{ marginTop: 12 }}>
            {error}{" "}
            <button
              className="btn ml-2"
              data-testid="autopsy-retry"
              onClick={() => {
                ranRef.current = "";
                if (decisionId && chunkId) void run(decisionId, chunkId);
              }}
            >
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
              {running
                ? "Replaying with and without…"
                : "No ablation yet — pick a retained chunk."}
            </div>
          )
        )}
      </div>
    </div>
  );
}
