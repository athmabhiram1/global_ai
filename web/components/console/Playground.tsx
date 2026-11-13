"use client";

import { useMemo } from "react";
import { isDemoStart } from "../../lib/tour";

function useDemoMode(): boolean {
  return useMemo(() => {
    try {
      if (typeof window === "undefined") return false;
      return isDemoStart(window.location.search);
    } catch {
      return false;
    }
  }, []);
}

// Playground: honest about having no generation endpoint. Real mode renders a
// disabled panel; demo mode (?demo=1) renders a static, pre-written A/B
// illustration clearly badged as a sample. Never fetches, never random.
export default function PlaygroundSection() {
  const demo = useDemoMode();

  if (demo) {
    return (
      <div data-testid="playground-section">
        <div className="pv-head">
          <h2>Playground</h2>
          <p className="why">
            <span className="chip a" data-testid="playground-sample-badge">
              <span className="dot"></span>Sample output — not a live run
            </span>
          </p>
        </div>
        <div className="pg-wrap">
          <div className="pg-col">
            <div className="pg-col-h">
              <b>RAW (STALE)</b>
              <span className="chip">
                <span className="dot"></span>sample
              </span>
            </div>
            <div className="pg-out" data-testid="playground-sample-raw">
              Acme Pro is $29 per seat per month, billed annually. This
              reflects the launch announcement from last year. Discounts may
              still apply at checkout.
            </div>
            <div className="pg-stats">
              <span>
                tokens <b>411</b>
              </span>
              <span>
                accuracy <b>0.00</b>
              </span>
              <span className="chip">sample</span>
            </div>
          </div>
          <div className="pg-col">
            <div className="pg-col-h">
              <b>CURATED</b>
              <span className="chip">
                <span className="dot"></span>sample
              </span>
            </div>
            <div className="pg-out" data-testid="playground-sample-curated">
              Acme Pro is $49 per seat per month. The older $29 launch figure
              is stale and was dropped before the model call. Every price
              claim cites the current docs page.
            </div>
            <div className="pg-stats">
              <span>
                tokens <b>361</b>
              </span>
              <span>
                accuracy <b>1.00</b>
              </span>
              <span className="chip">sample</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="playground-section">
      <div className="pv-head">
        <h2>Playground</h2>
        <p className="why" data-testid="playground-disabled-copy">
          No generation endpoint is configured on this sidecar — the console
          only replays recorded requests for autopsy. To compare raw vs curated
          answers, run the eval harness (examples/eval) or point
          CC_GATEWAY_URL at a provider-keyed gateway.
        </p>
        <p className="why">
          <a className="btn sm" href="#pv-evals">
            View Evals
          </a>
        </p>
      </div>
    </div>
  );
}
