"use client";

import { useEffect, useRef, useState } from "react";

// Decorative gateway graph. The canvas animation carries no data; the
// admitted/killed counters are real ledger totals passed in as props.
// Nodes drag with 16px snap; Reset layout restores the template positions.
const BASE = [
  { fx: 0.045, fy: 0.1, cls: "", title: "support-bot", sub: "policy: support/pricing" },
  { fx: 0.045, fy: 0.44, cls: "", title: "docs-assistant", sub: "policy: docs/default" },
  { fx: 0.045, fy: 0.78, cls: "", title: "research-agent", sub: "policy: research/deep" },
  {
    fx: 0.36,
    fy: 0.36,
    cls: "gw",
    title: "bifrost-http :8080",
    sub: "openai-compatible · dynamic .so",
    mg: true,
  },
  { fx: 0.76, fy: 0.14, cls: "", title: "openai / gpt-4o", sub: "primary provider" },
  { fx: 0.76, fy: 0.48, cls: "", title: "mock provider", sub: "fallback · deterministic" },
  { fx: 0.58, fy: 0.8, cls: "", title: "tavily", sub: "relay → http · 900 ms cap" },
] as const;

const EDGES: Array<[number, number]> = [
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 4],
  [3, 5],
  [3, 6],
];

const SNAP = 16;

const MG_SVG = (
  <svg className="gw-mg" viewBox="0 0 32 34" aria-hidden="true">
    <path
      className="mg-fill"
      d="M16 2 L29 9.5 V24.5 L16 32 L3 24.5 V9.5 Z"
    />
    <path
      className="mg-line"
      d="M16 2 L29 9.5 V24.5 L16 32 L3 24.5 V9.5 Z"
    />
    <path className="mg-line" d="M10 16.5 L14 20.5 L22.5 11" />
  </svg>
);

export default function Graph({
  admitted,
  killed,
  live,
}: {
  admitted: number;
  killed: number;
  live: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [off, setOff] = useState<{ x: number; y: number }[]>(() =>
    BASE.map(() => ({ x: 0, y: 0 })),
  );
  const dragRef = useRef<{
    idx: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const center = (el: HTMLElement | null) => {
      if (!el) return { x: 0, y: 0 };
      const fr = frame.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        x: r.left - fr.left + r.width / 2,
        y: r.top - fr.top + r.height / 2,
      };
    };

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = frame.clientWidth;
      const h = frame.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // request-path edges between the node cards
      EDGES.forEach(([a, b], i) => {
        const p1 = center(nodeRefs.current[a]);
        const p2 = center(nodeRefs.current[b]);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const l = Math.hypot(dx, dy) || 1;
        const cx = mx - (dy / l) * 26;
        const cy = my + (dx / l) * 26;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
        const last = i === EDGES.length - 1;
        ctx.setLineDash(last ? [3, 6] : b === 5 ? [4, 6] : []);
        ctx.strokeStyle = last
          ? "rgba(255,178,36,.28)"
          : "rgba(255,255,255,.10)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      });
      // flowing request-path packets: pure decoration
      for (let i = 0; i < 10; i++) {
        const e = EDGES[i % EDGES.length];
        const p1 = center(nodeRefs.current[e[0]]);
        const p2 = center(nodeRefs.current[e[1]]);
        const p = (t * 0.004 + i / 10) % 1;
        const x = p1.x + (p2.x - p1.x) * p;
        const y = p1.y + (p2.y - p1.y) * p;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, 6.283);
        ctx.fillStyle =
          i % 3 === 0 ? "rgba(255,92,92,.5)" : "rgba(76,194,255,.55)";
        ctx.fill();
      }
      t += 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    if (!reduced) raf = requestAnimationFrame(draw);
    const onResize = () => {
      if (reduced) draw();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // redraw edges as nodes move (drag) — cheap direct draw on pointermove
  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
  }, [off]);

  const onPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    idx: number,
  ) => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      idx,
      sx: e.clientX,
      sy: e.clientY,
      ox: off[idx].x,
      oy: off[idx].y,
    };
    e.currentTarget.classList.add("drag");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = Math.round((d.ox + e.clientX - d.sx) / SNAP) * SNAP;
    const ny = Math.round((d.oy + e.clientY - d.sy) / SNAP) * SNAP;
    setOff((prev) => prev.map((o, i) => (i === d.idx ? { x: nx, y: ny } : o)));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.classList.remove("drag");
  };

  return (
    <div className="hero-viz">
      <div className="graph-frame" id="graph-frame" ref={frameRef}>
        <canvas id="gcv" aria-hidden="true" ref={canvasRef} />
        {BASE.map((n, i) => (
          <div
            key={n.title}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            className={`node${n.cls ? ` ${n.cls}` : ""}`}
            data-drag="true"
            style={{
              left: `${n.fx * 100}%`,
              top: `${n.fy * 100}%`,
              transform: `translate(${off[i].x}px, ${off[i].y}px)`,
            }}
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="ncard">
              {"mg" in n && n.mg ? (
                <div className="n-top" style={{ alignItems: "center" }}>
                  {MG_SVG}
                  <div>
                    <div className="n-top">
                      <span className="dot"></span>
                      <b>{n.title}</b>
                    </div>
                    <div className="n-sub">{n.sub}</div>
                  </div>
                  <span className="g-badge" style={{ marginLeft: 6 }}>
                    PreRequestHook
                  </span>
                </div>
              ) : (
                <>
                  <div className="n-top">
                    <span className="dot"></span>
                    <b>{n.title}</b>
                  </div>
                  <div className="n-sub">{n.sub}</div>
                </>
              )}
            </div>
          </div>
        ))}
        <div className="g-corner">
          <span className="pill">
            <span className="dot"></span>
            {live ? (
              <>
                LIVE · <b>PreRequestHook</b> · admitted{" "}
                <b className="acc" id="gw-adm">
                  {admitted}
                </b>{" "}
                · killed <b id="gw-kill">{killed}</b>
              </>
            ) : (
              <>
                offline · <b>PreRequestHook</b> · last seen admitted{" "}
                <b className="acc" id="gw-adm">
                  {admitted}
                </b>{" "}
                · killed <b id="gw-kill">{killed}</b>
              </>
            )}
          </span>
          <button
            className="btn xs"
            id="gw-reset"
            onClick={() => setOff(BASE.map(() => ({ x: 0, y: 0 })))}
          >
            Reset
          </button>
        </div>
        <div className="g-hint">
          Drag the nodes — killed chunks fall out with reason codes
        </div>
      </div>
    </div>
  );
}
