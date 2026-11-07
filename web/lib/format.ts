// Small formatting helpers shared by landing + console. No dependencies.

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

/** Input-token cut as a whole percent, e.g. tin=4000 tout=3520 -> 12. */
export function cutPct(tin: number, tout: number): number {
  if (!tin || tin <= 0) return 0;
  return Math.round((1 - tout / tin) * 100);
}

/** p95 of a numeric sample. Returns null when there is nothing to measure. */
export function p95(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

/** Share (0..1) of dropped chunks that carry a non-empty reason code. */
export function reasonShare(reasons: string[]): number | null {
  if (reasons.length === 0) return null;
  const withReason = reasons.filter((r) => r && r.trim().length > 0).length;
  return withReason / reasons.length;
}

/** "—" placeholder while fewer than MIN_SAMPLE decisions exist. */
export const MIN_SAMPLE = 5;

export function orDash(v: string): string {
  return v;
}
