// Measured eval strip. Every number comes from examples/eval/results.md
// (50 questions x 3 repeats): raw accuracy 0.480, curated 1.000,
// provider tokens -12.0%, mean latency 8 ms. Labelled with their source;
// never recalculated live, never generated.
export const EVAL = {
  questions: 50,
  repeats: 3,
  raw: "0.480",
  curated: "1.000",
  tokenDelta: "-12.0%",
  latencyMs: 8,
  latency: "8 ms",
  staleSourceDeltaPp: "+52.0 pp",
  source: "examples/eval/results.md",
} as const;
