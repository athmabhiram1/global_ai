import { NextRequest, NextResponse } from "next/server";
import { forwardToSidecar } from "../../../../lib/sidecarProxy";

// Same-origin proxy: forwards /api/cc/* to the sidecar and injects the
// bearer token server-side. CC_ADMIN_TOKEN never enters the browser.
// cache: no-store — the console always reads the live ledger.
export const dynamic = "force-dynamic";

async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const contentType = req.headers.get("content-type");
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }
  try {
    const res = await forwardToSidecar(path, {
      method: req.method,
      search: req.nextUrl.search || "",
      contentType,
      body,
      sidecarUrl: process.env.CC_SIDECAR_URL,
      adminToken: process.env.CC_ADMIN_TOKEN,
    });
    const headers = new Headers();
    if (res.contentType) headers.set("content-type", res.contentType);
    return new NextResponse(res.body, { status: res.status, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "sidecar unreachable", detail: msg }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return forward(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return forward(req, ctx);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return forward(req, ctx);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return forward(req, ctx);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return forward(req, ctx);
}
