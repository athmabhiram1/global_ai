"use client";

import { useEffect, useState } from "react";
import { useDecisions, useReputation } from "../../lib/hooks";
import Drawer from "./Drawer";
import TracesSection from "./Traces";
import AutopsySection from "./AutopsySection";
import SourcesSection from "./Sources";
import PolicySection from "./Policy";
import { OverviewKPIs, MeasuredStrip } from "./Overview";

const SECTIONS = [
  { id: "ov-overview", no: "01", label: "Overview" },
  { id: "ov-traces", no: "02", label: "Traces" },
  { id: "ov-autopsy", no: "03", label: "Autopsy" },
  { id: "ov-sources", no: "04", label: "Sources" },
  { id: "ov-policy", no: "05", label: "Policy" },
] as const;

function ScopeFilter({
  policies,
  value,
  onChange,
}: {
  policies: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="scope scope-w">
      <button
        id="scope-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span id="scope-label">
          {value === "all" ? "all policies" : value}
        </span>
      </button>
      <div className={`menu${open ? " open" : ""}`} id="scope-menu" role="listbox">
        <div className="mh">policy scope</div>
        {["all", ...policies].map((p) => (
          <button
            key={p}
            role="option"
            aria-selected={(value === "all" ? "all" : value) === p}
            className={(value === "all" ? "all" : value) === p ? "on" : ""}
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
          >
            {p === "all" ? "all policies" : p}
            <span className="ck">✓</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Shell() {
  const decisions = useDecisions(5000);
  const reputation = useReputation(15000);
  const [scope, setScope] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [palOpen, setPalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const rows = decisions.data;
  const scoped =
    rows === null || scope === "all"
      ? rows
      : rows.filter((r) => r.policy === scope);
  const policies =
    rows === null ? [] : [...new Set(rows.map((r) => r.policy))].sort();
  const denied = (reputation.data || [])
    .filter((r) => r.denied)
    .map((r) => r.domain);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setPalOpen(false);
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (location.hash === "#connect") setModalOpen(true);
  }, []);

  return (
    <main id="pg-app" className="page active">
      <header className="topbar">
        <div className="wrap in">
          <div className="crumb">
            <b>context-curator</b>
            <span className="sep">/</span>
            <span id="crumb-sec">console</span>
          </div>
          <ScopeFilter policies={policies} value={scope} onChange={setScope} />
          <div className="right">
            {decisions.connected ? (
              <button
                id="sim-badge"
                title="Sidecar connected — data is live"
                onClick={decisions.refresh}
              >
                <span className="dot"></span>LIVE — REFRESH
              </button>
            ) : (
              <button
                id="sim-badge"
                title="Sidecar unreachable — showing last successful data"
                onClick={decisions.refresh}
                data-testid="disconnected-chip"
              >
                <span className="dot"></span>DISCONNECTED — RETRY
              </button>
            )}
            <button id="btn-k" onClick={() => setPalOpen(true)}>
              ⌘K
            </button>
          </div>
        </div>
      </header>

      <div className="shell">
        <aside className="rail" aria-label="Console sections">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              data-sec={s.id}
              className={i === 0 ? "cur" : ""}
              title={s.label}
              onClick={() =>
                document
                  .getElementById(s.id)
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {s.label.slice(0, 2)}
            </button>
          ))}
          <div className="rsep"></div>
          <button
            id="rail-connect"
            title="Connect backend"
            onClick={() => setModalOpen(true)}
          >
            ⇔
          </button>
        </aside>

        <div className="content">
          <section id="ov-overview">
            <div className="sec-h">
              <span className="no">01</span>
              <h2>Overview</h2>
              <span className="note">triage · policy-scope aware</span>
            </div>
            <p className="lede">
              The admission layer in one glance: what the gate is doing to
              context, what it costs, and where it hurts. Every number below
              is computed from the same ledger the sidecar writes.
            </p>
            {!decisions.connected && decisions.error && (
              <p className="memo badm" role="alert">
                Sidecar unreachable ({decisions.error}). Showing last
                successful data.
              </p>
            )}
            {scoped === null && decisions.connected && (
              <p className="lede">Loading…</p>
            )}
            {scoped !== null && scoped.length === 0 && rows !== null && (
              <p className="lede">No admissions recorded yet.</p>
            )}
            {scoped !== null && scoped.length > 0 && (
              <OverviewKPIs rows={scoped} />
            )}
          </section>

          <section id="ov-traces">
            <div className="sec-h">
              <span className="no">02</span>
              <h2>Admission traces</h2>
              <span className="note">decisions table · written by PostLLMHook · WAL</span>
            </div>
            <p className="lede">
              One row per request. <b>Click a row</b> — it opens the decision
              file: chunk scorecards and per-claim freshness.
            </p>
            <TracesSection rows={scoped} onOpen={setOpenId} />
          </section>

          <section id="ov-autopsy">
            <div className="sec-h">
              <span className="no">03</span>
              <h2>Autopsy</h2>
              <span className="note">counterfactual replay · temp 0 · never on the serving path</span>
            </div>
            <p className="lede">
              The proof. Pick a retained chunk; the sidecar replays the
              request <b>with</b> and <b>without</b> it, aligns both answers
              sentence-by-sentence, and files an influence score.
            </p>
            <AutopsySection rows={scoped} />
          </section>

          <section id="ov-sources">
            <div className="sec-h">
              <span className="no">04</span>
              <h2>Source reputation</h2>
              <span className="note">Beta(α, β) · one table · every app behind the gateway</span>
            </div>
            <p className="lede">
              Utility is the posterior mean <span className="m">α / (α+β)</span>,
              read live by the scorer. Feedback here is <b>not siloed per
              app</b> — deny hard-blocks at admission.
            </p>
            {!reputation.connected && reputation.error && (
              <p className="memo badm" role="alert">
                Sidecar unreachable ({reputation.error}).
              </p>
            )}
            <SourcesSection rows={reputation.data} onChanged={reputation.refresh} />
          </section>

          <section id="ov-policy">
            <div className="sec-h">
              <span className="no">05</span>
              <h2>Policy</h2>
              <span className="note">resolved virtual key → route → default</span>
            </div>
            <p className="lede">
              One document, enforced in the request path. The kill list below
              is <b>live</b> — deny a domain in §04 and it lands here before
              any model call is made.
            </p>
            <PolicySection denied={denied} onChanged={reputation.refresh} />
          </section>

          <MeasuredStripWrap />

          <footer id="app-foot">
            <span>context-curator console · live ledger</span>
            <span className="sp"></span>
            <span className="fq">every claim must come from eval/results.md</span>
          </footer>
        </div>
      </div>

      {openId && <Drawer requestId={openId} onClose={() => setOpenId(null)} />}

      {palOpen && (
        <div id="pal" className="open">
          <div className="p-scrim" onClick={() => setPalOpen(false)} />
          <div className="p-box" role="dialog" aria-label="Command palette">
            <div className="p-in">
              <input autoFocus placeholder="Go to…" aria-label="Go to section" />
            </div>
            <div className="p-list">
              <div className="p-grp">sections</div>
              {SECTIONS.map((s) => (
                <div
                  key={s.id}
                  className="p-item"
                  onClick={() => {
                    setPalOpen(false);
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span className="pl">
                    {s.no} · {s.label}
                  </span>
                  <span className="pd">{s.id}</span>
                </div>
              ))}
            </div>
            <div className="p-foot">
              <span>esc to close</span>
              <span className="sp"></span>
              <span>⌘K anywhere</span>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div id="modal" className="open">
          <div className="m-scrim" onClick={() => setModalOpen(false)} />
          <div className="m-box" role="dialog" aria-label="Connect backend" id="connect">
            <button className="m-close" onClick={() => setModalOpen(false)}>
              ✕
            </button>
            <h3>Connect your sidecar</h3>
            <p className="msub">
              The console talks to the sidecar through{" "}
              <span className="mono">/api/cc/*</span>, which injects{" "}
              <span className="mono">CC_ADMIN_TOKEN</span> server-side.
            </p>
            <div className="m-step">
              <span className="n">1</span>
              <div>
                <h5>Point the proxy at your host</h5>
                <p>
                  Set <b>CC_SIDECAR_URL</b> to your sidecar origin (default{" "}
                  <b>http://127.0.0.1:8090</b>) and{" "}
                  <b>CC_ADMIN_TOKEN</b> to the same token the sidecar runs
                  with.
                </p>
              </div>
            </div>
            <div className="m-step">
              <span className="n">2</span>
              <div>
                <h5>Send a chat through Bifrost</h5>
                <p>
                  Decisions appear in <b>§02 traces</b> as rows are written to
                  the ledger.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MeasuredStripWrap() {
  return (
    <div style={{ marginTop: 24 }}>
      <MeasuredStrip />
    </div>
  );
}
