import { describe, expect, it } from "vitest";
import {
  DEMO_DECISIONS,
  DEMO_DECISION_DETAIL,
  DEMO_POLICY_SUMMARY,
  DEMO_REPUTATION,
} from "./demoSeed";
import { mapDecisions, mapDetail, mapRep } from "./api";

describe("demoSeed shapes", () => {
  it("has 3 decision rows: 2 admitted, 1 killed with authority_denied", () => {
    expect(DEMO_DECISIONS).toHaveLength(3);
    const admitted = DEMO_DECISIONS.filter((d) => d.chunks_kept > 0);
    expect(admitted.length).toBe(2);
    const killed = DEMO_DECISIONS.filter((d) => d.chunks_kept === 0);
    expect(killed).toHaveLength(1);
    expect(killed[0].dropped.map((x) => x.reason)).toContain(
      "authority_denied",
    );
  });

  it("every decision row passes the same runtime shape assertions as api.test.ts", () => {
    const rows = mapDecisions(DEMO_DECISIONS);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.policy).toBe("string");
      expect(typeof row.mode).toBe("string");
      expect(typeof row.cin).toBe("number");
      expect(typeof row.cout).toBe("number");
      expect(Array.isArray(row.reasons)).toBe(true);
      expect(row._live).toBe(true);
    }
    for (const d of DEMO_DECISIONS) {
      const detail = mapDetail(d);
      expect(detail.chunks.length).toBeGreaterThan(0);
      expect(detail.id).toBe(d.request_id);
    }
  });

  it("decision chunk records carry domain/verdict/authority/scores", () => {
    for (const d of DEMO_DECISIONS) {
      expect(Array.isArray(d.chunks)).toBe(true);
      expect(d.chunks!.length).toBeGreaterThan(0);
      for (const c of d.chunks!) {
        expect(typeof c.domain).toBe("string");
        expect(["keep", "drop"]).toContain(c.verdict);
        expect(typeof c.authority).toBe("string");
        expect(typeof c.score).toBe("number");
      }
    }
  });

  it("has 4 reputation rows incl. one denied", () => {
    expect(DEMO_REPUTATION).toHaveLength(4);
    expect(DEMO_REPUTATION.filter((r) => r.Denied)).toHaveLength(1);
    for (const r of DEMO_REPUTATION) {
      const item = mapRep(r);
      expect(item.domain).toBe(r.Domain);
      expect(item.denied).toBe(r.Denied);
    }
  });

  it("denied reputation row maps to the denied tier", () => {
    const denied = DEMO_REPUTATION.find((r) => r.Denied)!;
    expect(mapRep(denied).tier).toBe("denied");
  });

  it("decision detail map covers every seed id", () => {
    for (const d of DEMO_DECISIONS) {
      expect(DEMO_DECISION_DETAIL[d.request_id]).toBeDefined();
    }
  });

  it("policy summary carries an effective mode", () => {
    expect(DEMO_POLICY_SUMMARY.effective_mode ?? DEMO_POLICY_SUMMARY.mode).toBeTruthy();
  });
});
