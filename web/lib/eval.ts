// Measured eval strip. Every number comes from examples/eval/results.md
// (50 questions x 3 repeats): raw accuracy 0.480, curated 1.000,
// provider tokens -12.0%, mean latency 8 ms. Labelled with their source;
// never recalculated live, never generated.
export const EVAL = {
  questions: 50,
  repeats: 3,
  raw: "0.480",
  curated: "1.000",
  rawTokens: 416,
  curatedTokens: 366,
  tokenDelta: "-12.0%",
  latencyMs: 8,
  latency: "8 ms",
  staleSourceDeltaPp: "+52.0 pp",
  source: "examples/eval/results.md",
} as const;

// Per-family means from the same results.md table. P/F/M families carry the
// stale-price trap (raw 0.00 -> curated 1.00); V/L/R families were already
// clean (1.00 -> 1.00). Kept here so Evals.tsx renders without duplicating
// numbers.
export const EVAL_FAMILIES = [
  { id: "P", label: "Pricing", range: "P01–P12", raw: "0.00", curated: "1.00" },
  { id: "F", label: "Freshness", range: "F01–F08", raw: "0.00", curated: "1.00" },
  { id: "V", label: "Version", range: "V01–V08", raw: "1.00", curated: "1.00" },
  { id: "L", label: "Law", range: "L01–L08", raw: "1.00", curated: "1.00" },
  { id: "R", label: "Retention", range: "R01–R08", raw: "1.00", curated: "1.00" },
  { id: "M", label: "Mixed", range: "M01–M06", raw: "0.00", curated: "1.00" },
] as const;
