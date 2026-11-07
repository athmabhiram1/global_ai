import { NextResponse } from "next/server";

// Local health probe — no sidecar dependency, no auth.
// Silences stale /api/health polls (old tabs, uptime checks) with a 200
// instead of a Next 404. Live sidecar status stays on /api/cc/healthz.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "cc-console" });
}
