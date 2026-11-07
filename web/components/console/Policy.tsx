"use client";

import { useEffect, useState } from "react";
import { api, type PolicySummary } from "../../lib/api";

export const MODE_DESC: Record<string, string> = {
  annotate:
    "Nothing is removed. Decisions are recorded and attached as annotations — the safest default for unknown routes.",
  rewrite:
    "Dropped chunks are removed from context before the provider call; every fallback attempt sees the curated request.",
  block:
    "Requests containing hard-denied sources are refused outright. No provider call happens; the ledger shows blocked rows.",
};

export type Mode = "annotate" | "rewrite" | "block";

/** Kill list is live union: config authority.deny + Denied reputation rows. */
export function unionDenied(
  summary: PolicySummary | null,
  repDenied: string[],
): string[] {
  const fromConfig: string[] = [];
  const auth = summary?.authority as { deny?: unknown } | undefined;
  if (Array.isArray(auth?.deny)) {
    for (const d of auth.deny) if (typeof d === "string" && d) fromConfig.push(d);
  }
  return [...new Set([...fromConfig, ...(repDenied || [])])].sort();
}

export function ModeSeg({
  mode,
  onMode,
}: {
  mode: string;
  onMode: (m: Mode) => void;
}) {
  const modes: Mode[] = ["annotate", "rewrite", "block"];
  return (
    <div className="seg" role="group" aria-label="Policy mode">
      {modes.map((m) => (
        <button
          key={m}
          data-mode={m}
          data-testid={`mode-${m}`}
          className={mode === m ? "on" : ""}
          onClick={() => onMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function PolicyView({
  mode,
  summary,
  denied,
  onMode,
}: {
  mode: string;
  summary: PolicySummary | null;
  denied: string[];
  onMode: (m: Mode) => void;
}) {
  const killList = unionDenied(summary, denied);
  return (
    <div className="pol-grid">
      <div className="codeblk">
        <code data-testid="policy-yaml">
          {summary ? JSON.stringify(summary, null, 2) : "loading…"}
        </code>
      </div>
      <div className="comp">
        <div className="crow2">
          <b>Mode</b>
          <div className="cv">
            <ModeSeg mode={mode} onMode={onMode} />
            <p style={{ marginTop: 8 }} data-testid="policy-mode">
              mode: <b>{mode || "unknown"}</b>
            </p>
            {mode && MODE_DESC[mode] && <p>{MODE_DESC[mode]}</p>}
          </div>
        </div>
        <div className="crow2">
          <b>Deny kill-list</b>
          <div className="cv" data-testid="deny-chips">
            {killList.length > 0 ? (
              killList.map((d) => (
                <span key={d} className="chip r">
                  {d}
                </span>
              ))
            ) : (
              <span className="lede">kill-list empty</span>
            )}
          </div>
        </div>
        <div className="crow2">
          <b>Claims</b>
          <div className="cv">
            {summary?.claims ? (
              <span className="m">{JSON.stringify(summary.claims)}</span>
            ) : (
              <span className="lede">
                Claim extraction is not configured.
              </span>
            )}
          </div>
        </div>
        <div className="crow2">
          <b>Autopsy</b>
          <div className="cv">
            {summary?.autopsy ? (
              <span className="m">{JSON.stringify(summary.autopsy)}</span>
            ) : (
              <span className="lede">Replay is unavailable.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PolicySection({
  denied,
  onChanged,
}: {
  denied: string[];
  onChanged: () => void;
}) {
  const [mode, setMode] = useState("");
  const [summary, setSummary] = useState<PolicySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await api.policySummary();
      setSummary(s);
      setMode(
        (s.effective_mode as string) || (s.mode as string) || "",
      );
      setError(null);
    } catch (e: unknown) {
      // Older sidecars have no /policy/summary yet: fall back to raw YAML.
      try {
        const t = await api.policyText();
        setMode(t.mode);
        setError(null);
      } catch (e2: unknown) {
        setError(e2 instanceof Error ? e2.message : String(e2));
      }
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setPolicyMode(m: Mode) {
    // Live: the next decision's mode field changes without a restart.
    await api.setMode(m);
    setMode(m);
    onChanged();
  }

  if (error)
    return (
      <p className="memo badm" role="alert">
        {/503/.test(error)
          ? "No policy loaded — the sidecar has no policy file."
          : error}
      </p>
    );

  return (
    <PolicyView
      mode={mode}
      summary={summary}
      denied={denied}
      onMode={(m) => void setPolicyMode(m)}
    />
  );
}
