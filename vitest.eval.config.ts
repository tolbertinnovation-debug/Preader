import { defineConfig } from "vitest/config";
import path from "node:path";

// Accuracy evaluation for the AI Content Detector: `npm run eval:detect`.
// Uses live detection models when their keys are set in the environment.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["eval/**/*.eval.ts"], environment: "node", testTimeout: 30 * 60_000 },
});
