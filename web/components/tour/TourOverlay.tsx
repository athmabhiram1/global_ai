"use client";

import { useEffect, useRef, useState } from "react";
import {
  TOUR_STEPS,
  nextIndex,
  prefersReducedMotion,
  prevIndex,
  resolveTarget,
} from "../../lib/tour";

// Spotlight overlay + tour card. Uses the frozen template ids (#tour-spot +
// #tour-card with step counter, title/text, dots, progress bar in auto,
// Back/Skip/Next). Targets resolve against live DOM and fall back to a
// centered card when absent — the tour narrates, it never invents rows.
export default function TourOverlay({
  auto,
  onClose,
}: {
  auto: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [reduced] = useState(() => prefersReducedMotion());
  const spotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const step = TOUR_STEPS[i];

  // Spotlight placement whenever the step changes.
  useEffect(() => {
    const spot = spotRef.current;
    const card = cardRef.current;
    if (!spot || !card) return;
    card.classList.remove("show");

    const centered = () => {
      spot.style.display = "none";
      card.style.left = "max(12px, calc(50% - 165px))";
      card.style.top = "max(12px, calc(50% - 110px))";
      card.classList.add("show");
    };

    const place = () => {
      const el = resolveTarget(step.selectors) as HTMLElement | null;
      if (!el) {
        centered();
        return;
      }
      try {
        if (step.section) {
          document
            .getElementById(step.section)
            ?.scrollIntoView({
              behavior: reduced ? "auto" : "smooth",
              block: "start",
            });
        } else {
          el.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "center",
          });
        }
      } catch {
        // scrollIntoView unavailable — place against the current rect.
      }
      const doPlace = () => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 && r.height < 2) {
          centered();
          return;
        }
        const pad = 8;
        spot.style.display = "block";
        spot.style.left = `${r.left - pad}px`;
        spot.style.top = `${r.top - pad}px`;
        spot.style.width = `${r.width + pad * 2}px`;
        spot.style.height = `${r.height + pad * 2}px`;
        const cw = 330;
        const ch = card.offsetHeight || 190;
        const x = Math.min(
          Math.max(r.left + r.width / 2 - cw / 2, 14),
          Math.max(14, window.innerWidth - cw - 14),
        );
        let y = r.bottom + 16;
        if (y + ch > window.innerHeight - 14) y = r.top - ch - 16;
        if (y < 14) y = Math.min(r.top + 14, window.innerHeight - ch - 14);
        card.style.left = `${Math.max(14, x)}px`;
        card.style.top = `${Math.max(14, y)}px`;
        card.classList.add("show");
      };
      if (reduced) doPlace();
      else setTimeout(doPlace, 420);
    };

    const t = setTimeout(place, 60);
    return () => clearTimeout(t);
  }, [i, step, reduced]);

  // Auto-advance in demo mode. Reduced-motion only affects animation (already
  // neutralized by the frozen CSS media query), not tour timing.
  useEffect(() => {
    if (!auto) return;
    if (i >= TOUR_STEPS.length - 1) {
      const t = setTimeout(() => closeRef.current(), step.dur);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI(nextIndex(i)), step.dur);
    return () => clearTimeout(t);
  }, [i, auto, step.dur]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const last = i >= TOUR_STEPS.length - 1;

  return (
    <div id="tour">
      <div id="tour-spot" ref={spotRef} />
      <div
        id="tour-card"
        ref={cardRef}
        role="dialog"
        aria-label={step.title}
      >
        <div className="t-k">
          <span id="tour-step">
            {step.end ? "END" : `STEP ${i + 1} / ${TOUR_STEPS.length}`}
          </span>
          {auto && (
            <span className="auto" id="tour-auto">
              AUTO
            </span>
          )}
        </div>
        <h4 id="tour-title">{step.title}</h4>
        <p id="tour-text">{step.text}</p>
        <div
          className={`t-prog${auto ? " on" : ""}`}
          id="tour-prog"
        >
          <i
            key={i}
            style={{ animationDuration: `${step.dur / 1000}s` }}
          />
        </div>
        <div className="t-btns">
          <button className="t-skip" id="tour-skip" onClick={onClose}>
            Skip
          </button>
          <div className="t-dots" id="tour-dots">
            {TOUR_STEPS.map((s, d) => (
              <i key={s.id} className={d === i ? "on" : ""} />
            ))}
          </div>
          <button
            className="btn xs"
            id="tour-prev"
            disabled={i === 0}
            onClick={() => setI(prevIndex(i))}
          >
            Back
          </button>
          <button
            className="btn xs pri"
            id="tour-next"
            onClick={() => (last ? onClose() : setI(nextIndex(i)))}
          >
            {last ? "Finish ✓" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
