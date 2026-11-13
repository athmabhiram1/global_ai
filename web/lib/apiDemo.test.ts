// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, isDemoMode, __resetDemoStore } from "./api";
import { DEMO_DECISIONS } from "./demoSeed";
import { decisionRowFixture, stubFetch } from "./testFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/console");
  __resetDemoStore();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/console");
  __resetDemoStore();
});

describe("isDemoMode", () => {
  it("is false without ?demo and true with ?demo=1", () => {
    window.history.replaceState(null, "", "/console");
    expect(isDemoMode()).toBe(false);
    window.history.replaceState(null, "", "/console?demo=1");
    expect(isDemoMode()).toBe(true);
  });
});

describe("api demo switch (?demo=1)", () => {
  it("decisions() returns the 3 seed rows without touching fetch", async () => {
    window.history.replaceState(null, "", "/console?demo=1");
    const { fetchFn, calls } = stubFetch(
      () => new Response(JSON.stringify([decisionRowFixture]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const rows = await api.decisions();
    expect(calls).toHaveLength(0);
    expect(rows.map((r) => r.id)).toEqual(
      DEMO_DECISIONS.map((d) => d.request_id),
    );
  });

  it("decision() resolves known seed ids and 404s unknown ids like the real path", async () => {
    window.history.replaceState(null, "", "/console?demo=1");
    vi.stubGlobal(
      "fetch",
      (async () => new Response("no", { status: 500 })) as typeof fetch,
    );
    const detail = await api.decision(DEMO_DECISIONS[0].request_id);
    expect(detail.id).toBe(DEMO_DECISIONS[0].request_id);
    await expect(api.decision("no-such-id")).rejects.toThrow(/404/);
  });

  it("deny() flips a domain denied and persists in-memory", async () => {
    window.history.replaceState(null, "", "/console?demo=1");
    vi.stubGlobal(
      "fetch",
      (async () => {
        throw new Error("must not fetch in demo");
      }) as typeof fetch,
    );
    const before = await api.reputation();
    const target = before.find((r) => !r.denied)!;
    const updated = await api.deny(target.domain, true);
    expect(updated.Denied).toBe(true);
    const after = await api.reputation();
    expect(after.find((r) => r.domain === target.domain)?.denied).toBe(true);
  });

  it("setMode() persists in-memory and surfaces via policySummary", async () => {
    window.history.replaceState(null, "", "/console?demo=1");
    vi.stubGlobal(
      "fetch",
      (async () => {
        throw new Error("must not fetch in demo");
      }) as typeof fetch,
    );
    await api.setMode("block");
    const summary = await api.policySummary();
    expect(summary.effective_mode ?? summary.mode).toBe("block");
    expect((await api.policy()).mode).toBe("block");
  });
});

describe("api real mode (no ?demo)", () => {
  it("decisions() still hits the fetch proxy", async () => {
    window.history.replaceState(null, "", "/console");
    const { fetchFn, calls } = stubFetch((url) =>
      url.endsWith("/api/cc/api/context-curator/decisions")
        ? new Response(JSON.stringify([decisionRowFixture]), { status: 200 })
        : new Response("nope", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    const rows = await api.decisions();
    expect(calls).toHaveLength(1);
    expect(rows[0].id).toBe("rq-1");
  });
});
