import { defineConfig } from "vitest/config";

// Next.js requires `jsx: preserve` in tsconfig, so teach vitest's esbuild
// to use the automatic JSX runtime for tests instead.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
});
