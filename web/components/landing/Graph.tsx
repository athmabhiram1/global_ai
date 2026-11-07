"use client";

import { useEffect, useRef } from "react";

// Decorative gateway graph. The canvas animation carries no data; the
// admitted/killed counters are real ledger totals passed in as props.
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  return (
    <div className="graph-outer">
      <div className="graph-frame" id="graph-frame">
        <canvas id="gcv" aria-hidden="true" ref={canvasRef} />
        <div className="node" style={{ left: "8%", top: "52%" }}>
          <div className="ncard">
            <div className="n-top">
              <span className="dot"></span>
              <b>retriever</b>
            </div>
            <div className="n-sub">tavily · relay</div>
          </div>
        </div>
        <div className="node gw" style={{ left: "42%", top: "30%" }}>
          <div className="ncard">
            <div className="n-top">
              <span className="dot"></span>
              <b>admission gate</b>
              <span className="g-badge">PreRequestHook</span>
            </div>
            <div className="n-sub">authority · freshness · utility</div>
          </div>
        </div>
        <div className="node" style={{ left: "74%", top: "55%" }}>
          <div className="ncard">
            <div className="n-top">
              <span className="dot"></span>
              <b>provider</b>
            </div>
            <div className="n-sub">curated request only</div>
          </div>
        </div>
        <div className="g-corner">
          <span className="pill">
            <span className="dot"></span>
            {live ? "LIVE" : "OFFLINE"} · <b>PreRequestHook</b> · admitted{" "}
            <b className="acc" id="gw-adm">
              {admitted}
            </b>{" "}
            · killed <b id="gw-kill">{killed}</b>
          </span>
        </div>
        <div className="g-hint">
          Killed chunks fall out with reason codes — open the console for the
          real ledger.
        </div>
      </div>
    </div>
  );
}
