import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

/**
 * Manual Gemini integration smoke test config — NEVER part of `npm test`.
 * Run explicitly with:  npm run test:gemini
 * Requires GEMINI_API_KEY and makes ONE real API request (consumes quota).
 *
 * The live test must permit the configured Gemini timeout (default 540000 ms)
 * plus at least 30 seconds of Vitest/test overhead.
 */
function configuredGeminiTimeoutMs(): number {
  let raw = process.env.GEMINI_TIMEOUT_MS;
  if (!raw) {
    try {
      const envFile = fs.readFileSync(path.resolve(__dirname, ".env.local"), "utf8");
      const match = envFile.match(/^\s*GEMINI_TIMEOUT_MS\s*=\s*(.+)\s*$/m);
      raw = match?.[1]?.trim();
    } catch {
      // Fall through to the default below.
    }
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 540_000;
}

const liveTestTimeoutMs = configuredGeminiTimeoutMs() + 30_000;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests-live/**/*.test.ts"],
    testTimeout: liveTestTimeoutMs,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
