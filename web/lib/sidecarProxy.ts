// Server-side forwarding core for app/api/cc/[...path]/route.ts.
// Kept here (not inline in the route) so vitest can import it — the
// `[...path]` directory name breaks module resolution under vitest.
// CC_ADMIN_TOKEN is injected here, never in the browser.

export const SIDECAR_DEFAULT = "http://127.0.0.1:8090";

export interface ForwardInit {
  method: string;
  search: string;
  contentType: string | null;
  body?: ArrayBuffer;
  sidecarUrl?: string;
  adminToken?: string;
  fetchImpl?: typeof fetch;
}

export interface ForwardResult {
  status: number;
  contentType: string | null;
  body: ArrayBuffer;
}

export async function forwardToSidecar(
  path: string[],
  init: ForwardInit,
): Promise<ForwardResult> {
  const base = init.sidecarUrl || SIDECAR_DEFAULT;
  const target = `${base}/${path.join("/")}${init.search || ""}`;

  const headers = new Headers();
  if (init.contentType) headers.set("content-type", init.contentType);
  if (init.adminToken) headers.set("authorization", `Bearer ${init.adminToken}`);

  const doFetch = init.fetchImpl || fetch;
  let upstream: Response;
  try {
    upstream = await doFetch(target, {
      method: init.method,
      headers,
      body: init.method === "GET" || init.method === "HEAD" ? undefined : init.body,
      cache: "no-store",
    });
  } catch (e: unknown) {
    throw new Error(
      `sidecar unreachable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const buf = await upstream.arrayBuffer();
  return {
    status: upstream.status,
    contentType: upstream.headers.get("content-type"),
    body: buf,
  };
}
