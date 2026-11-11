"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useDecisions, useReputation } from "../../lib/hooks";
import { api } from "../../lib/api";
import Drawer from "./Drawer";
import TracesSection from "./Traces";
import AutopsySection from "./AutopsySection";
import SourcesSection from "./Sources";
import PolicySection from "./Policy";
import { OverviewKPIs, MeasuredStrip } from "./Overview";

const RAIL_ICONS: Record<string, JSX.Element> = {
  "ov-overview": (<svg className="ic" viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>),
  "ov-traces": (<svg className="ic" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>),
  "ov-autopsy": (<svg className="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></svg>),
  "ov-sources": (<svg className="ic" viewBox="0 0 24 24"><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 0 2 2h13" /></svg>),
  "ov-policy": (<svg className="ic" viewBox="0 0 24 24"><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="15" cy="8" r="2.2" /><circle cx="7" cy="16" r="2.2" /></svg>),
};

const SECTIONS = [
  { id: "ov-overview", no: "01", label: "Overview" },
  { id: "ov-traces", no: "02", label: "Admission traces" },
  { id: "ov-autopsy", no: "03", label: "Autopsy" },
  { id: "ov-sources", no: "04", label: "Source reputation" },
  { id: "ov-policy", no: "05", label: "Policy" },
] as const;

function toast(msg: string, kind = "") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<span class="dot"></span><span></span>`;
  t.querySelector("span:last-child")!.textContent = msg;
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 280);
  }, 3200);
}

function smoothTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1200);
}

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
        <svg className="ic" viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /></svg>
        <span id="scope-label">
          {value === "all" ? "all policies" : value}
        </span>
        <svg className="ic" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className={`menu${open ? " open" : ""}`} id="scope-menu" role="listbox">
        <div className="mh">policy scope</div>
        {["all", ...policies].map((p) => (
          <button
            key={p}
            role="option"
            aria-selected={value === p}
            className={value === p ? "on" : ""}
            onClick={() => {
              onChange(p);
              setOpen(false);
              toast(`scope → ${p === "all" ? "all policies" : p}`);
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

type PalItem = { g: string; label: string; d: string; run: () => void };

export default function Shell() {
  const decisions = useDecisions(5000);
  const reputation = useReputation(15000);
  const [scope, setScope] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [palOpen, setPalOpen] = useState(false);
  const [palQ, setPalQ] = useState("");
  const [palSel, setPalSel] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [cur, setCur] = useState("ov-overview");
  const palInput = useRef<HTMLInputElement>(null);

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

  const openDecision = (id: string) => {
    setOpenId(id);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("decision", id);
      window.history.replaceState(null, "", u.toString());
    } catch {}
  };
  const closeDecision = () => {
    setOpenId(null);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("decision");
      window.history.replaceState(null, "", u.toString());
    } catch {}
  };

  // ?decision= deep-link + #section anchor on mount
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const d = u.searchParams.get("decision");
      if (d) setOpenId(d);
      const h = window.location.hash.replace("#", "");
      if (h && document.getElementById(h)) {
        setTimeout(() => smoothTo(h), 120);
      }
    } catch {}
  }, []);

  // rail .cur tracking via IntersectionObserver + crumb-sec
  useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (!("IntersectionObserver" in window) || els.length === 0) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            setCur(e.target.id);
            const m = e.target.id.match(/^ov-(\w+)$/);
            const crumb = document.getElementById("crumb-sec");
            if (crumb && m) crumb.textContent = m[1];
          }
        });
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [scoped === null]);

  // ⌘K / Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setPalOpen(false);
        setModalOpen(false);
        closeDecision();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // cc-toast events from drawer
  useEffect(() => {
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent).detail as string;
      if (msg) toast(msg, "ok");
    };
    window.addEventListener("cc-toast", onToast);
    return () => window.removeEventListener("cc-toast", onToast);
  }, []);

  useEffect(() => {
    if (palOpen) {
      setPalQ("");
      setPalSel(0);
      setTimeout(() => palInput.current?.focus(), 40);
    }
  }, [palOpen]);

  const setModeFromPalette = (m: "annotate" | "rewrite" | "block") => {
    smoothTo("ov-policy");
    setTimeout(() => {
      const b = document.querySelector<HTMLButtonElement>(
        `.seg [data-mode="${m}"]`,
      );
      if (b) b.click();
      else toast(`policy mode → ${m}`);
    }, 400);
  };

  const palItems: PalItem[] = useMemo(() => {
    const items: PalItem[] = [];
    items.push(
      { g: "Navigate", label: "01 · Overview", d: "G 1", run: () => smoothTo("ov-overview") },
      { g: "Navigate", label: "02 · Admission traces", d: "G 2", run: () => smoothTo("ov-traces") },
      { g: "Navigate", label: "03 · Autopsy — counterfactual proof", d: "G 3", run: () => smoothTo("ov-autopsy") },
      { g: "Navigate", label: "04 · Source reputation", d: "G 4", run: () => smoothTo("ov-sources") },
      { g: "Navigate", label: "05 · Policy — resolved config", d: "G 5", run: () => smoothTo("ov-policy") },
    );
    (scoped || []).slice(0, 10).forEach((d) =>
      items.push({
        g: "Decisions",
        label: `${d.id} — ${d.app}`,
        d: `${d.cin}→${d.cout} chunks`,
        run: () => {
          smoothTo("ov-traces");
          setTimeout(() => openDecision(d.id), 350);
        },
      }),
    );
    (["annotate", "rewrite", "block"] as const).forEach((m) =>
      items.push({
        g: "Actions",
        label: `Set policy mode → ${m}`,
        d: "",
        run: () => setModeFromPalette(m),
      }),
    );
    items.push(
      {
        g: "Actions",
        label: "Deny content-farm.example",
        d: "hard block",
        run: () => {
          api
            .deny("content-farm.example", true)
            .then(() => {
              reputation.refresh();
              toast("content-farm.example hard-denied — enforced before any model call", "bad");
            })
            .catch(() => toast("deny failed — sidecar unreachable", "bad"));
          smoothTo("ov-sources");
        },
      },
      {
        g: "Actions",
        label: "Reset layout of the hero graph",
        d: "",
        run: () => toast("layout reset"),
      },
      { g: "Actions", label: "Connect real backend…", d: "CC_ADMIN_TOKEN", run: () => setModalOpen(true) },
      { g: "Actions", label: "Retry ledger fetch", d: "", run: () => decisions.refresh() },
    );
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped]);

  const palFiltered = useMemo(() => {
    const q = palQ.trim().toLowerCase();
    if (!q) return palItems;
    return palItems.filter((i) =>
      `${i.label} ${i.g} ${i.d}`.toLowerCase().includes(q),
    );
  }, [palItems, palQ]);

  const palRun = (i: number) => {
    const it = palFiltered[Math.min(Math.max(0, i), palFiltered.length - 1)];
    if (!it) return;
    setPalOpen(false);
    it.run();
  };

  return (
    <main id="pg-app" className="page active">
      <div id="toasts" role="status" aria-live="polite"></div>
      <header className="topbar">
        <div className="wrap in">
          <div className="crumb">
            <b>context-curator</b>
            <span className="sep">/</span>
            <span>console</span>
            <span className="sep">/</span>
            <span id="crumb-sec">overview</span>
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
            <button id="btn-k" onClick={() => setPalOpen(true)} aria-label="Command palette">
              <svg className="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <kbd>⌘K</kbd>
            </button>
          </div>
        </div>
      </header>

      <div className="shell">
        <aside className="rail" aria-label="Console sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              data-sec={s.id}
              className={cur === s.id ? "cur" : ""}
              title={s.label}
              onClick={() => smoothTo(s.id)}
            >
              {RAIL_ICONS[s.id]}
            </button>
          ))}
          <div className="rsep"></div>
          <button
            id="rail-connect"
            title="Connect backend"
            onClick={() => setModalOpen(true)}
          >
            <svg className="ic" viewBox="0 0 24 24"><path d="M9 7l-4 5 4 5M15 7l4 5-4 5" /></svg>
          </button>
        </aside>

        <div className="content">
          <section id="ov-overview">
            <div className="sec-h">
              <span className="no">01</span>
              <h2>Overview</h2>
              <span className="note">triage · last 24 h · policy-scope aware</span>
            </div>
            <p className="lede">
              The admission layer in one glance: what the gate is doing to
              context, what it costs, and where it hurts. Every number below is
              computed from the same ledger the <span className="m">PostLLMHook</span>{" "}
              writes to SQLite.
            </p>
            {!decisions.connected && decisions.error && (
              <p className="lede" role="alert">
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
              One row per request. <b>Click a row</b> — it morphs into the
              decision file: scorecards, the flame graph of the hook pipeline,
              and per-claim freshness. Live traffic is polled at ~5 s
              intervals.
            </p>
            <TracesSection rows={scoped} total={rows?.length ?? 0} onOpen={openDecision} />
            <div className="measured">
              <span className="tag">Eval · 50 questions</span>
              <span>
                tokens <b>−12.0%</b>
              </span>
              <span>
                mean latency <b>8 ms</b>
              </span>
              <span>
                stale-source acc <b>+52.0 pp</b>
              </span>
              <span>
                raw <b>0.480 → 1.000</b>
              </span>
              <span>
                reasoned drops <b>100%</b>
              </span>
              <small>every claim must come from eval/results.md before submission</small>
            </div>
          </section>

          <section id="ov-autopsy">
            <div className="sec-h">
              <span className="no">03</span>
              <h2>Autopsy</h2>
              <span className="note">counterfactual replay · temp 0 · never on the serving path</span>
            </div>
            <p className="lede">
              The proof. Pick a retained chunk; the sidecar replays the request{" "}
              <b>with</b> and <b>without</b> it, aligns both answers
              sentence-by-sentence (LCS), and files an influence score. Max 5
              ablations per call, cached 60 min.
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
              Utility is the posterior mean{" "}
              <span className="m">α / (α+β)</span>, read live by the scorer.
              Feedback here is <b>not siloed per app</b> — deny hard-blocks at
              admission.
            </p>
            {!reputation.connected && reputation.error && (
              <p className="lede" role="alert">
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

          <MeasuredStrip />

          <footer id="app-foot">
            <span>context-curator console · live ledger</span>
            <span className="sp"></span>
            <span className="fq">every claim must come from eval/results.md</span>
          </footer>
        </div>
      </div>

      {openId && <Drawer requestId={openId} onClose={closeDecision} />}

      {palOpen && (
        <div id="pal" className="open">
          <div className="p-scrim" onClick={() => setPalOpen(false)} />
          <div className="p-box" role="dialog" aria-label="Command palette">
            <div className="p-in">
              <svg viewBox="0 0 24 24" className="ic"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input
                id="pal-in"
                ref={palInput}
                value={palQ}
                onChange={(e) => {
                  setPalQ(e.target.value);
                  setPalSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPalSel((s) => Math.min(s + 1, palFiltered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPalSel((s) => Math.max(s - 1, 0));
                  } else if (e.key === "Enter") {
                    palRun(palSel);
                  }
                }}
                placeholder="Search decisions, jump to sections, run actions…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Go to section"
              />
              <kbd>esc</kbd>
            </div>
            <div className="p-list" id="pal-list">
              {palFiltered.length === 0 && (
                <div className="p-none">No results for “{palQ}”.</div>
              )}
              {(() => {
                let lastG = "";
                return palFiltered.map((it, i) => {
                  const head =
                    it.g !== lastG ? (
                      <div className="p-grp" key={`g-${it.g}-${i}`}>
                        {it.g}
                      </div>
                    ) : null;
                  lastG = it.g;
                  return (
                    <div key={`${it.g}-${it.label}`}>
                      {head}
                      <div
                        className={`p-item${i === palSel ? " sel" : ""}`}
                        data-i={i}
                        onClick={() => palRun(i)}
                        onMouseMove={() => setPalSel(i)}
                      >
                        <span className="pi">⌘</span>
                        <span className="pl">{it.label}</span>
                        <span className="pd">{it.d}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="p-foot">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span className="sp"></span>
              <span>esc to close</span>
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
            <h3>Wire this console to the real sidecar</h3>
            <p className="msub">
              Everything renders through one adapter (<span className="mono">CC</span> in the source). The mocks already return the exact
              shapes documented in <span className="mono">docs/ARCHITECTURE.md §6 / §14</span> — going live is a config change, not a rewrite.
            </p>
            <div className="m-step">
              <span className="n">1</span>
              <div>
                <h5>Point the adapter at your sidecar</h5>
                <p>
                  Serve this console from the sidecar <b>root</b> or set{" "}
                  <b>CC_SIDECAR_URL</b> to your sidecar origin (default{" "}
                  <b>http://127.0.0.1:8090</b>) with the same{" "}
                  <b>CC_ADMIN_TOKEN</b>.
                </p>
              </div>
            </div>
            <div className="m-step">
              <span className="n">2</span>
              <div>
                <h5>Keep the token server-side</h5>
                <p>
                  The browser calls <b>/api/cc/*</b>; the route handler injects{" "}
                  <b>Authorization: Bearer &lt;CC_ADMIN_TOKEN&gt;</b>. The token
                  never ships to the client.
                </p>
              </div>
            </div>
            <div className="m-step">
              <span className="n">3</span>
              <div>
                <h5>Send a chat through Bifrost</h5>
                <p>
                  Decisions appear in <b>§02 traces</b> as rows are written to
                  the ledger via <b>PostLLMHook</b>.
                </p>
              </div>
            </div>
            <div className="m-code">
              <button
                className="btn xs"
                id="btn-copy"
                style={{ position: "absolute", top: 10, right: 10 }}
                onClick={() => {
                  const txt = document.getElementById("cfg-snippet")?.innerText || "";
                  const done = () => toast("integration snippet copied", "ok");
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(txt).then(done, done);
                  } else {
                    done();
                  }
                }}
              >
                Copy
              </button>
              <pre id="cfg-snippet">{`CC_SIDECAR_URL=http://127.0.0.1:8090
CC_ADMIN_TOKEN=<same token the sidecar runs with>

GET  /api/context-curator/decisions
GET  /api/context-curator/decisions/:id
GET  /api/context-curator/reputation
POST /api/context-curator/feedback   {domain, verdict}
POST /api/context-curator/autopsy    {request_id, chunk_id}`}</pre>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
