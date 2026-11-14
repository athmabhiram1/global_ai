"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useDecisions, useReputation } from "../../lib/hooks";
import { api } from "../../lib/api";
import { isDemoStart } from "../../lib/tour";
import Drawer from "./Drawer";
import TracesSection from "./Traces";
import AutopsySection from "./AutopsySection";
import SourcesSection from "./Sources";
import PolicySection from "./Policy";
import { OverviewKPIs, MeasuredStrip } from "./Overview";

const NAV = [
  {
    id: "traces",
    label: "Traces",
    icon: (
      <svg className="ic" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: "autopsy",
    label: "Autopsy",
    icon: (
      <svg className="ic" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M12 4v16" />
      </svg>
    ),
  },
  {
    id: "sources",
    label: "Sources",
    icon: (
      <svg className="ic" viewBox="0 0 24 24">
        <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
        <path d="M4 19a2 2 0 0 0 2 2h13" />
      </svg>
    ),
  },
  {
    id: "policy",
    label: "Policy",
    icon: (
      <svg className="ic" viewBox="0 0 24 24">
        <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
        <circle cx="15" cy="8" r="2.2" />
        <circle cx="7" cy="16" r="2.2" />
      </svg>
    ),
  },
  {
    id: "evals",
    label: "Evals",
    icon: (
      <svg className="ic" viewBox="0 0 24 24">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    id: "playground",
    label: "Playground",
    icon: (
      <svg className="ic" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
  },
] as const;

type Page = (typeof NAV)[number]["id"];

// Evals + Playground load through a guarded boundary: the rejection handler
// renders an honest fallback instead of breaking Shell if a chunk 404s.
// @ts-ignore — keeps Vitest's transform from statically resolving the specifier.
const EvalsSection = lazy(() =>
  import(/* @vite-ignore */ "./Evals").then(
    (m: { default: ComponentType }) => ({ default: m.default }),
    () => ({
      default: () => (
        <p className="why">Evals are unavailable in this build.</p>
      ),
    }),
  ),
);

// @ts-ignore — see note above.
const PlaygroundSection = lazy(() =>
  import(/* @vite-ignore */ "./Playground").then(
    (m: { default: ComponentType }) => ({ default: m.default }),
    () => ({
      default: () => (
        <p className="why">Playground is unavailable in this build.</p>
      ),
    }),
  ),
);

function toast(msg: string, kind = "") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  const dot = document.createElement("span");
  dot.className = "dot";
  const tx = document.createElement("span");
  tx.textContent = msg;
  t.append(dot, tx);
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 280);
  }, 3200);
}

function startTour() {
  try {
    window.dispatchEvent(new CustomEvent("cc-tour-start"));
  } catch {}
}

function smoothTo(id: string) {
  const el = document.getElementById(id);
  if (!el || typeof el.scrollIntoView !== "function") return;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    try {
      el.scrollIntoView();
    } catch {
      /* non-visual environment: nothing to scroll */
    }
  }
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
    <div className="scope scope-w" style={{ marginTop: 12 }}>
      <button
        id="scope-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn xs"
      >
        <span id="scope-label">
          {value === "all" ? "all policies" : value}
        </span>
      </button>
      {open && (
        <div className="menu open" id="scope-menu" role="listbox">
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
            </button>
          ))}
        </div>
      )}
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
  const [cur, setCur] = useState<Page>("traces");
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

  const go = (p: Page) => {
    setCur(p);
    const crumb = document.getElementById("top-crumb");
    if (crumb) crumb.textContent = p;
    smoothTo(`pv-${p}`);
  };

  // ?decision= deep-link + #section anchor on mount
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const d = u.searchParams.get("decision");
      if (d) setOpenId(d);
      const h = window.location.hash.replace("#", "");
      if (h && document.getElementById(h)) {
        const m = h.match(/^pv-(\w+)$/);
        if (m) setCur(m[1] as Page);
        setTimeout(() => smoothTo(h), 120);
      }
    } catch {}
  }, []);

  // .side .sitem .cur tracking + crumb label
  useEffect(() => {
    const ids = NAV.map((s) => `pv-${s.id}`);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (!("IntersectionObserver" in window) || els.length === 0) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            const m = e.target.id.match(/^pv-(\w+)$/);
            if (m) {
              setCur(m[1] as Page);
              const crumb = document.getElementById("top-crumb");
              if (crumb) crumb.textContent = m[1];
            }
          }
        });
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [scoped === null]);

  // Cross-component navigation (drawer "Open autopsy →" hands off here).
  useEffect(() => {
    const onGo = (e: Event) => {
      const p = (e as CustomEvent<string>).detail;
      if (typeof p === "string" && NAV.some((s) => s.id === p)) {
        go(p as Page);
      }
    };
    window.addEventListener("cc-go", onGo);
    return () => window.removeEventListener("cc-go", onGo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (palOpen) {
      setPalQ("");
      setPalSel(0);
      setTimeout(() => palInput.current?.focus(), 40);
    }
  }, [palOpen]);

  const retry = () => {
    decisions.refresh();
    reputation.refresh();
  };

  const setModeFromPalette = (m: "annotate" | "rewrite" | "block") => {
    go("policy");
    setTimeout(() => {
      const b = document.querySelector<HTMLButtonElement>(
        `.seg [data-mode="${m}"]`,
      );
      if (b) b.click();
      else {
        api
          .setMode(m)
          .then(() => {
            reputation.refresh();
            toast(`policy mode → ${m}`, "ok");
          })
          .catch(() => toast("mode switch failed — sidecar unreachable", "bad"));
      }
    }, 400);
  };

  const palItems: PalItem[] = useMemo(() => {
    const items: PalItem[] = [];
    items.push(
      { g: "Pages", label: "Traces", d: "admission ledger", run: () => go("traces") },
      { g: "Pages", label: "Autopsy", d: "counterfactual proof", run: () => go("autopsy") },
      { g: "Pages", label: "Sources", d: "reputation table", run: () => go("sources") },
      { g: "Pages", label: "Policy", d: "resolved config", run: () => go("policy") },
      { g: "Pages", label: "Evals", d: "committed before/after results", run: () => go("evals") },
      { g: "Pages", label: "Playground", d: "sample A/B in demo, disabled live", run: () => go("playground") },
    );
    (scoped || []).slice(0, 10).forEach((d) =>
      items.push({
        g: "Decisions",
        label: `${d.id} — ${d.app}`,
        d: `${d.cin}→${d.cout} chunks`,
        run: () => {
          go("traces");
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
          go("sources");
        },
      },
      {
        g: "Actions",
        label: "Reset layout",
        d: "",
        run: () => toast("layout reset"),
      },
      { g: "Actions", label: "Connect real backend…", d: "CC_ADMIN_TOKEN", run: () => setModalOpen(true) },
      { g: "Actions", label: "Retry ledger fetch", d: "", run: () => retry() },
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

  const connected = decisions.connected;

  let demo = false;
  try {
    demo = isDemoStart(window.location.search);
  } catch {
    demo = false;
  }

  return (
    <main id="pg-console" className="page active">
      <div id="toasts" role="status" aria-live="polite"></div>
      <header className="topbar">
        <div className="wrap in">
          <div className="crumb">
            <b>context-curator</b>
            <span className="sep">/</span>
            <span className="pg" id="top-crumb">
              {cur}
            </span>
          </div>
          <div className="right">
            <button
              className="btn acc sm"
              data-testid="tour-open"
              onClick={startTour}
            >
              <svg className="ic" viewBox="0 0 24 24">
                <path d="M7 5l12 7-12 7z" />
              </svg>{" "}
              Tour
            </button>
            {connected ? (
              <button
                id="sim-badge"
                title="Sidecar connected — data is live"
                onClick={() => setModalOpen(true)}
              >
                <span className="dot"></span>LIVE
              </button>
            ) : (
              <button
                id="sim-badge"
                title={
                  demo
                    ? "Sidecar unreachable — showing demo seed data (?demo=1). Remove ?demo for live sidecar data."
                    : "Sidecar unreachable — showing last successful data"
                }
                onClick={retry}
                data-testid="disconnected-chip"
              >
                <span className="dot"></span>DISCONNECTED — RETRY{demo ? " · ?demo=1" : ""}
              </button>
            )}
            {demo && (
              <span
                id="demo-badge"
                title="Demo mode — seeded sample data (?demo=1). Remove ?demo for live sidecar data."
              >
                SIM
              </span>
            )}
            <button
              id="btn-k"
              onClick={() => setPalOpen(true)}
              aria-label="Command palette"
            >
              <svg className="ic" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <kbd>⌘K</kbd>
            </button>
          </div>
        </div>
      </header>

      <div className="shell">
        <aside className="side" aria-label="Console navigation">
          <div className="side-label">Console</div>
          {NAV.map((s) => (
            <button
              key={s.id}
              className={`sitem${cur === s.id ? " cur" : ""}`}
              data-page={s.id}
              onClick={() => go(s.id)}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
          <div className="side-sp"></div>
          <button className="sitem sp2" data-testid="tour-open-side" onClick={startTour}>
            <svg className="ic" viewBox="0 0 24 24">
              <path d="M7 5l12 7-12 7z" />
            </svg>
            Guided tour
          </button>
          <button
            className="sitem"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            <svg className="ic" viewBox="0 0 24 24">
              <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            Front page
          </button>
        </aside>

        <div className="content">
          <section id="pv-traces" className={`pv${cur === "traces" ? " on" : ""}`}>
            <div className="pv-head">
              <h2>Admission traces</h2>
              <p className="why">
                One decision per request, made in <b>PreRequestHook</b> before
                any model call.
              </p>
              <div className="keyline">
                <span className="kd g">
                  <i></i>reached the model
                </span>
                <span className="kd r">
                  <i></i>killed with a reason
                </span>
                <span className="kd a">
                  <i></i>tavily refresh spent
                </span>
              </div>
              <ScopeFilter policies={policies} value={scope} onChange={setScope} />
            </div>
            {!connected && decisions.error && (
              <p className="why" role="alert">
                Sidecar unreachable ({decisions.error}). Showing last
                successful data.{demo ? " Demo seed (?demo=1) — remove ?demo for live sidecar data." : ""}{" "}
                <button className="btn xs" onClick={retry}>
                  Retry
                </button>
              </p>
            )}
            {scoped === null && connected && <p className="why">Loading…</p>}
            {scoped !== null && scoped.length === 0 && (
              <p className="why">No admissions recorded yet.</p>
            )}
            {scoped !== null && scoped.length > 0 && (
              <OverviewKPIs rows={scoped} />
            )}
            <TracesSection
              rows={scoped}
              total={rows?.length ?? 0}
              onOpen={openDecision}
            />
            <MeasuredStrip />
          </section>

          <section id="pv-autopsy" className={`pv${cur === "autopsy" ? " on" : ""}`}>
            <div className="pv-head">
              <h2>Autopsy</h2>
              <p className="why">
                <b>Proof by removal.</b> Replays the request with and without
                one chunk — temperature 0, off the serving path.
              </p>
            </div>
            <AutopsySection rows={scoped} />
          </section>

          <section id="pv-sources" className={`pv${cur === "sources" ? " on" : ""}`}>
            <div className="pv-head">
              <h2>Source reputation</h2>
              <p className="why">
                <b>One table, every app.</b> A domain the support bot burned is
                already distrusted by the research agent.
              </p>
            </div>
            {!reputation.connected && reputation.error && (
              <p className="why" role="alert">
                Sidecar unreachable ({reputation.error}).{" "}
                <button className="btn xs" onClick={retry}>
                  Retry
                </button>
              </p>
            )}
            <SourcesSection rows={reputation.data} onChanged={reputation.refresh} />
          </section>

          <section id="pv-policy" className={`pv${cur === "policy" ? " on" : ""}`}>
            <div className="pv-head">
              <h2>Policy</h2>
              <p className="why">
                The rulebook the gate enforces, resolved{" "}
                <b>virtual key → route → default</b>. The kill list is live.
              </p>
            </div>
            <PolicySection denied={denied} onChanged={reputation.refresh} />
          </section>

          <section id="pv-evals" className={`pv${cur === "evals" ? " on" : ""}`}>
            <div className="pv-head">
              <h2>Evals</h2>
              <p className="why">
                Pass/fail checks computed from the ledger — labeled seed
                rows under <b>?demo=1</b>, live sidecar rows otherwise.
              </p>
            </div>
            <Suspense fallback={<p className="why">Loading…</p>}>
              <EvalsSection />
            </Suspense>
          </section>

          <section id="pv-playground" className={`pv${cur === "playground" ? " on" : ""}`}>
            <div className="pv-head">
              <h2>Playground</h2>
              <p className="why">
                Probe the sidecar with ad-hoc prompts and watch admission
                decisions form — exploratory, nothing here is stored.
              </p>
            </div>
            <Suspense fallback={<p className="why">Loading…</p>}>
              <PlaygroundSection />
            </Suspense>
          </section>

          <footer id="app-foot">
            <span>bifrost-http :8080</span>
            <span>cc-sidecar :8090</span>
            <span className="fq">“It wasn’t the model. It was chunk c7.”</span>
            <span className="sp"></span>
            <button
              className="btn sm"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              ← Front page
            </button>
          </footer>
        </div>
      </div>

      {openId && <Drawer requestId={openId} onClose={closeDecision} />}

      {palOpen && (
        <div id="pal" className="open" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="p-scrim" data-pclose onClick={() => setPalOpen(false)} />
          <div className="p-box">
            <div className="p-in">
              <svg viewBox="0 0 24 24" className="ic">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
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
                placeholder="Pages, decisions, actions…"
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
                        <span className="pl">{it.label}</span>
                        <span className="pd">{it.d}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="p-foot">
              <span>↑↓</span>
              <span>↵</span>
              <span className="sp"></span>
              <span>⌘K</span>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div id="modal" className="open" role="dialog" aria-modal="true" aria-label="Connect the real backend">
          <div className="m-scrim" data-mclose onClick={() => setModalOpen(false)} />
          <div className="m-box">
            <button className="m-close" data-mclose onClick={() => setModalOpen(false)} aria-label="Close">
              <svg className="ic" viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <h3>Wire this console to the real sidecar</h3>
            <p className="msub">
              Every panel reads the live sidecar ledger through{" "}
              <span className="mono">/api/cc/*</span>; with{" "}
              <span className="mono">?demo=1</span> it reads labeled seed data
              instead.
            </p>
            <div className="m-step">
              <span className="n">1</span>
              <div>
                <h5>Point the console at your sidecar</h5>
                <p>
                  Serve this console from the sidecar <b>root</b> or set{" "}
                  <b>CC_SIDECAR_URL</b> to your sidecar origin with the same{" "}
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
                  Decisions appear in <b>traces</b> as rows are written to the
                  ledger.
                </p>
              </div>
            </div>
            <div className="m-code">
              <button
                className="btn xs"
                id="btn-copy"
                style={{ position: "absolute", top: 10, right: 10 }}
                onClick={() => {
                  const txt =
                    document.getElementById("cfg-snippet")?.innerText || "";
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
              <pre id="cfg-snippet">
{`GET  /api/context-curator/policy
GET  /api/context-curator/decisions
GET  /api/context-curator/decisions/:id
GET  /api/context-curator/reputation
POST /api/context-curator/feedback   {domain, verdict}
POST /api/context-curator/autopsy    {request_id, chunk_id}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
