"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TourOverlay from "./TourOverlay";
import {
  demoLandingRedirect,
  isDemoStart,
  isTourStart,
} from "../../lib/tour";

// Global tour host mounted once from the root layout. ?demo=1 autostarts the
// tour in auto mode with a visible "Guided demo" badge (real data only — no
// seeded decisions, no mock store); ?tour=1 starts it manually. Landing demo
// starts redirect to the console, where the tour targets live DOM.
export default function TourHost() {
  const router = useRouter();
  const replaceRef = useRef(router.replace);
  replaceRef.current = router.replace;
  const [tour, setTour] = useState<null | { auto: boolean }>(null);
  const [demo, setDemo] = useState(false);

  const close = useCallback(() => setTour(null), []);

  useEffect(() => {
    const manual = () => setTour({ auto: false });
    window.addEventListener("cc-start-tour", manual);
    let pathname = "";
    let search = "";
    try {
      pathname = window.location.pathname;
      search = window.location.search;
    } catch {
      return () => window.removeEventListener("cc-start-tour", manual);
    }
    const redirect = demoLandingRedirect(pathname, search);
    if (redirect) {
      setDemo(true);
      replaceRef.current(redirect);
    } else if (isDemoStart(search)) {
      setDemo(true);
      setTour({ auto: true });
    } else if (isTourStart(search)) {
      setTour({ auto: false });
    }
    return () => window.removeEventListener("cc-start-tour", manual);
  }, []);

  return (
    <>
      {demo && (
        <div
          id="demo-badge"
          className="chip a"
          style={{
            position: "fixed",
            left: 12,
            bottom: 12,
            zIndex: 940,
          }}
        >
          <span className="dot"></span>Guided demo
        </div>
      )}
      {tour && <TourOverlay auto={tour.auto} onClose={close} />}
    </>
  );
}
