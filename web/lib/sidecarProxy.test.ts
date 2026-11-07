import { describe, expect, it, vi, afterEach } from "vitest";
import {
  forwardToSidecar,
  SIDECAR_DEFAULT,
} from "./sidecarProxy";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubUpstream(
  seen: Array<{ url: string; init?: RequestInit }>,
  status = 200,
  body = '{"ok":true}',
) {
  return async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("sidecar proxy forwarding", () => {
  it("forwards method, path, query and body with server-side auth", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", stubUpstream(seen));
    const res = await forwardToSidecar(["api", "context-curator", "deny"], {
      method: "POST",
      search: "",
      contentType: "application/json",
      body: new TextEncoder().encode(
        JSON.stringify({ domain: "x.example", denied: true }),
      ).buffer as ArrayBuffer,
      adminToken: "secret-token",
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(`${SIDECAR_DEFAULT}/api/context-curator/deny`);
    expect(seen[0].init?.method).toBe("POST");
    const headers = new Headers(seen[0].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].init?.cache).toBe("no-store");
  });

  it("passes query strings through on GET", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", stubUpstream(seen, 200, "[]"));
    await forwardToSidecar(["api", "context-curator", "decisions"], {
      method: "GET",
      search: "?limit=10",
      contentType: null,
    });
    expect(seen[0].url).toContain(
      "/api/context-curator/decisions?limit=10",
    );
  });

  it("sends no auth header when no admin token is configured (demo mode)", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", stubUpstream(seen));
    await forwardToSidecar(["healthz"], {
      method: "GET",
      search: "",
      contentType: null,
    });
    const headers = new Headers(seen[0].init?.headers);
    expect(headers.get("authorization")).toBeNull();
  });

  it("throws a plain unreachable error instead of fabricated data", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("connection refused");
    });
    await expect(
      forwardToSidecar(["healthz"], {
        method: "GET",
        search: "",
        contentType: null,
      }),
    ).rejects.toThrow("sidecar unreachable");
  });

  it("passes upstream status codes through unchanged", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", stubUpstream(seen, 503, "no policy loaded"));
    const res = await forwardToSidecar(["api", "context-curator", "policy"], {
      method: "GET",
      search: "",
      contentType: null,
    });
    expect(res.status).toBe(503);
  });
});
