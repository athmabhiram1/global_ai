import { describe, expect, it, vi, afterEach } from "vitest";
import {
  api,
  mapDecisions,
  mapDetail,
  mapRep,
  type DecisionRow,
} from "./api";
import { EVAL } from "./eval";
import {
  decisionRowFixture,
  legacyRowFixture,
  repRowFixture,
  stubFetch,
} from "./testFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapDecisions", () => {
  it("maps request rows to UI rows with template keys", () => {
    const [row] = mapDecisions([decisionRowFixture]);
    expect(row.id).toBe("rq-1");
    expect(row.policy).toBe("support-bot");
    expect(row.mode).toBe("rewrite");
    expect(row.cin).toBe(3);
    expect(row.cout).toBe(2);
    expect(row.reasons).toEqual(["stale"]);
    expect(row._live).toBe(true);
  });

  it("maps null/undefined to an empty list (no data is a valid state)", () => {
    expect(mapDecisions(null)).toEqual([]);
    expect(mapDecisions(undefined)).toEqual([]);
  });
});

describe("mapDetail with ChunkRecords", () => {
  it("prefers full chunk records with domain, scores and reasons", () => {
    const detail = mapDetail(decisionRowFixture);
    expect(detail.chunks).toHaveLength(3);
    const kept = detail.chunks.filter((c) => c.verdict === "keep");
    expect(kept.map((c) => c.dom)).toEqual([
      "docs.example.com",
      "github.com",
    ]);
    expect(kept[0].score).toBeCloseTo(0.82);
    expect(kept[0].record?.authority).toBe("primary");
    expect(kept[0].record?.freshness_class).toBe("price");
    const dropped = detail.chunks.filter((c) => c.verdict === "drop");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("stale");
    expect(dropped[0].record?.refresh_failed).toBe(true);
  });

  it("falls back to ID-only chunks for legacy rows without Chunks JSON", () => {
    const detail = mapDetail(legacyRowFixture);
    expect(detail.chunks).toHaveLength(3);
    expect(
      detail.chunks.filter((c) => c.verdict === "keep").map((c) => c.id),
    ).toEqual(["c1", "c2"]);
    expect(detail.chunks.every((c) => c.record === undefined)).toBe(true);
    const dropped = detail.chunks.filter((c) => c.verdict === "drop");
    expect(dropped[0].reason).toBe("stale");
  });
});

describe("mapRep", () => {
  it("tiers reputable domains by Beta posterior utility", () => {
    const item = mapRep(repRowFixture);
    expect(item.domain).toBe("docs.example.com");
    expect(item.tier).toBe("reputable");
    expect(item.a).toBe(7);
    expect(item.b).toBe(3);
  });

  it("marks denied domains", () => {
    expect(mapRep({ ...repRowFixture, Denied: true }).tier).toBe("denied");
  });
});

describe("EVAL constants", () => {
  it("matches examples/eval/results.md: 50 questions, 0.480/1.000, -12.0%, 8ms", () => {
    expect(EVAL.questions).toBe(50);
    expect(EVAL.raw).toBe("0.480");
    expect(EVAL.curated).toBe("1.000");
    expect(EVAL.tokenDelta).toBe("-12.0%");
    expect(EVAL.latency).toBe("8 ms");
    expect(EVAL.latencyMs).toBe(8);
  });
});

describe("api paths (same-origin proxy, no token in browser)", () => {
  it("decisions() hits the proxy ledger route and maps rows", async () => {
    const { fetchFn, calls } = stubFetch((url) =>
      url.endsWith("/api/cc/api/context-curator/decisions")
        ? new Response(JSON.stringify([decisionRowFixture]), { status: 200 })
        : new Response("nope", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const rows = await api.decisions();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/cc/api/context-curator/decisions");
    expect(rows[0].id).toBe("rq-1");
  });

  it("feedback() posts positive=true for good and false for bad", async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify(repRowFixture), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.feedback("docs.example.com", "good");
    await api.feedback("docs.example.com", "bad");
    expect(calls[0].url).toContain("/api/cc/api/context-curator/feedback");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      domain: "docs.example.com",
      positive: true,
    });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      domain: "docs.example.com",
      positive: false,
    });
  });

  it("deny() posts domain+denied to /deny", async () => {
    const { fetchFn, calls } = stubFetch(
      () =>
        new Response(JSON.stringify({ ...repRowFixture, Denied: true }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.deny("blog.example.com");
    expect(calls[0].url).toContain("/api/cc/api/context-curator/deny");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      domain: "blog.example.com",
      denied: true,
    });
  });

  it("setMode() posts the mode to /policy/mode", async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify({ mode: "rewrite" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.setMode("rewrite");
    expect(calls[0].url).toContain("/api/cc/api/context-curator/policy/mode");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      mode: "rewrite",
    });
  });

  it("resetRep() posts the domain, or an empty body for reset-all", async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.resetRep("docs.example.com");
    await api.resetRep();
    expect(calls[0].url).toContain("/api/cc/api/context-curator/reputation/reset");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      domain: "docs.example.com",
    });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({});
  });

  it("autopsy() posts request and chunk ids", async () => {
    const { fetchFn, calls } = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            influence: 0.25,
            diff: { changed: [], added: [], removed: [], total: 1 },
            with: "a",
            without: "b",
            cached: false,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.autopsy("rq-1", "c1");
    expect(calls[0].url).toContain("/api/cc/api/context-curator/autopsy");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      request_id: "rq-1",
      chunk_id: "c1",
    });
  });

  it("keeps decision rows type-compatible with the sidecar model", () => {
    const row: DecisionRow = decisionRowFixture;
    expect(row.request_id).toBe("rq-1");
  });

  it("never sends Authorization from the browser (token stays server-side)", async () => {
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.decisions();
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(calls[0].url.startsWith("/api/cc/")).toBe(true);
  });

  it("autopsy preserves dropped-chunk rejection verbatim (retained-only, no fake zero)", async () => {
    const { fetchFn } = stubFetch(
      () => new Response("chunk c9 was not retained", { status: 422 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await expect(api.autopsy("rq-1", "c9")).rejects.toThrow(
      /422.*not retained/,
    );
  });

  it("claims preserves the unconfigured error verbatim", async () => {
    const { fetchFn } = stubFetch(
      () =>
        new Response("Claim extraction is not configured", { status: 501 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await expect(api.claims("abc123")).rejects.toThrow(
      /501.*not configured/,
    );
  });

  it("policyText parses mode from raw YAML (summary-404 fallback path)", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("mode: rewrite\nbudget: {}", { status: 200 }),
    );
    const t = await api.policyText();
    expect(t.mode).toBe("rewrite");
    expect(t.raw).toContain("rewrite");
  });
});
