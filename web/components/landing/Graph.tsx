"use client";

import { useEffect, useRef, useState } from "react";

// Decorative gateway graph. The canvas animation carries no data; the
// admitted/killed counters are real ledger totals passed in as props.
// Nodes drag with 16px snap; Reset layout restores the template positions.
const BASE = [
  { left: "8%", top: "52%", cls: "", title: "retriever", sub: "tavily · relay" },
  {
    left: "42%",
    top: "30%",
    cls: "gw",
    title: "admission gate",
    sub: "authority · freshness · utility",
  },
  {
    left: "74%",
    top: "55%",
    cls: "",
    title: "provider",
    sub: "curated request only",
  },
] as const;

const SNAP = 16;

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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      const w = (canvas.width = canvas.offsetWidth);
      const h = (canvas.height = canvas.offsetHeight);
      ctx.clearRect(0, 0, w, h);
      // flowing request-path dashes: pure decoration
      ctx.strokeStyle = "rgba(76,194,255,.28)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 10]);
      ctx.lineDashOffset = -t;
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.62);
      ctx.bezierCurveTo(w * 0.35, h * 0.2, w * 0.6, h * 0.85, w * 0.86, h * 0.42);
      ctx.stroke();
      ctx.setLineDash([]);
      // drifting killed-chunk sparks
      for (let i = 0; i < 14; i++) {
        const p = (t * 0.002 + i / 14) % 1;
        const x = w * (0.12 + 0.74 * p);
        const y = h * (0.62 + 0.18 * Math.sin(p * 9 + i * 1.7)) - p * h * 0.2;
        ctx.fillStyle =
          i % 3 === 0 ? "rgba(255,92,92,.5)" : "rgba(76,194,255,.4)";
        ctx.fillRect(x, y, 2, 2);
      }
      t += 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

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
    const nx =
      Math.round((d.ox + e.clientX - d.sx) / SNAP) * SNAP;
    const ny =
      Math.round((d.oy + e.clientY - d.sy) / SNAP) * SNAP;
    setOff((prev) => prev.map((o, i) => (i === d.idx ? { x: nx, y: ny } : o)));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.classList.remove("drag");
  };

  return (
    <div className="graph-outer">
      <div className="graph-frame" id="graph-frame" ref={frameRef}>
        <canvas id="gcv" aria-hidden="true" ref={canvasRef} />
        {BASE.map((n, i) => (
          <div
            key={n.title}
            className={`node${n.cls ? ` ${n.cls}` : ""}`}
            data-drag="true"
            style={{
              left: n.left,
              top: n.top,
              transform: `translate(${off[i].x}px, ${off[i].y}px)`,
            }}
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="ncard">
              <div className="n-top">
                <span className="dot"></span>
                <b>{n.title}</b>
                {n.cls === "gw" && (
                  <span className="g-badge">PreRequestHook</span>
                )}
              </div>
              <div className="n-sub">{n.sub}</div>
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
            Reset layout
          </button>
        </div>
        <div className="g-hint">
          Drag the nodes — snap 16px — the request path keeps flowing. Killed
          chunks fall out with reason codes.
        </div>
      </div>
    </div>
  );
}
