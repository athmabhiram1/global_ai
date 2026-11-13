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
  raw,
  denied,
  onMode,
}: {
  mode: string;
  summary: PolicySummary | null;
  raw: string | null;
  denied: string[];
  onMode: (m: Mode) => void;
}) {
  const killList = unionDenied(summary, denied);
  const budget = (summary?.budget ?? {}) as Record<string, number>;
  const maxTokens =
    typeof budget.max_context_tokens === "number"
      ? budget.max_context_tokens
      : null;
  const maxChunks =
    typeof budget.max_chunks === "number" ? budget.max_chunks : null;
  const freshness = (summary?.freshness ?? {}) as {
    classes?: Record<string, number>;
  };
  const classes =
    freshness.classes && typeof freshness.classes === "object"
      ? Object.entries(freshness.classes).filter(
          (e): e is [string, number] => typeof e[1] === "number",
        )
      : [];
  const maxAge = Math.max(1, ...classes.map(([, v]) => v));
  const claims = (summary?.claims ?? {}) as Record<string, unknown>;
  const autopsy = (summary?.autopsy ?? {}) as Record<string, unknown>;
  return (
    <div className="pol-grid">
      <div className="codeblk">
        <code data-testid="policy-yaml">{raw ?? "loading…"}</code>
      </div>
      <div className="comp">
        <div className="crow2">
          <b>Mode</b>
          <div className="cv">
            <ModeSeg mode={mode} onMode={onMode} />
            <p style={{ marginTop: 8 }} data-testid="policy-mode" id="mode-desc">
              {mode ? MODE_DESC[mode] ?? `mode: ${mode}` : "mode unknown"}
            </p>
          </div>
        </div>
        <div className="crow2">
          <b>Budget</b>
          <div className="cv">
            {maxTokens !== null ? (
              <>
                <span className="m">
                  {maxTokens.toLocaleString("en-US")} ctx tokens
                  {maxChunks !== null ? ` · ${maxChunks} chunks` : ""}
                </span>
                <div className="gauge">
                  <i
                    data-testid="budget-gauge"
                    style={{ transform: "scaleX(0.99)" }}
                  />
                </div>
              </>
            ) : (
              <span className="gcap">No budget reported by this sidecar.</span>
            )}
          </div>
        </div>
        <div className="crow2">
          <b>Freshness</b>
          <div className="cv">
            {classes.length > 0 ? (
              classes.map(([name, hours]) => (
                <div className="fbar" key={name}>
                  <span>{name}</span>
                  <div className="tr">
                    <i style={{ transform: `scaleX(${hours / maxAge})` }} />
                  </div>
                  <span className="hrs">{hours} h</span>
                </div>
              ))
            ) : (
              <span className="gcap">No freshness classes reported.</span>
            )}
          </div>
        </div>
        <div className="crow2">
          <b>Kill list</b>
          <div className="cv" data-testid="deny-chips" id="deny-chips">
            <div className="dchips">
              {killList.length > 0 ? (
                killList.map((d) => (
                  <span key={d} className="chip r">
                    <span className="dot"></span>
                    {d}
                  </span>
                ))
              ) : (
                <span className="lede">kill-list empty</span>
              )}
            </div>
            <span
              className="gcap"
              style={{ display: "block", marginTop: 7 }}
            >
              denied domains hard-block before any model call · updated live
              from §04.
            </span>
          </div>
        </div>
        <div className="crow2">
          <b>Hook</b>
          <div className="cv">
            <div className="hookstrip">
              <span className="h">PreAuth</span>
              <span className="a">→</span>
              <span className="h">Pre</span>
              <span className="a">→</span>
              <span className="h cur">PreRequest</span>
              <span className="a">→</span>
              <span className="h">provider + fallbacks</span>
              <span className="a">→</span>
              <span className="h">PostLLM</span>
              <span className="a">→</span>
              <span className="h">x-cc-decision-id</span>
            </div>
          </div>
        </div>
        <div className="crow2">
          <b>Claims</b>
          <div className="cv">
            {Object.keys(claims).length > 0 ? (
              <span className="m">{JSON.stringify(claims)}</span>
            ) : (
              <span className="lede">Claim extraction is not configured.</span>
            )}
          </div>
        </div>
        <div className="crow2">
          <b>Autopsy</b>
          <div className="cv">
            {Object.keys(autopsy).length > 0 ? (
              <span className="m">{JSON.stringify(autopsy)}</span>
            ) : (
              <span className="lede">
                Replay is unavailable: the sidecar has no gateway replayer
                configured.
              </span>
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
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await api.policySummary();
      setSummary(s);
      setMode(
        (s.effective_mode as string) || (s.mode as string) || "",
      );
      try {
        const t = await api.policyText();
        setRaw(t.raw);
        setMode((m) => m || t.mode);
      } catch {
        // Raw YAML is a nicety; structured summary already loaded.
      }
      setError(null);
    } catch (e: unknown) {
      // Older sidecars have no /policy/summary yet: fall back to raw YAML.
      try {
        const t = await api.policyText();
        setRaw(t.raw);
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
      raw={raw}
      denied={denied}
      onMode={(m) => void setPolicyMode(m)}
    />
  );
}
