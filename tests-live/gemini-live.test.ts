/**
 * MANUAL Gemini integration smoke test — explicitly invoked only.
 *
 *   GEMINI_API_KEY=<your key> npm run test:gemini     (consumes quota)
 *
 * This file is excluded from `npm test` (separate vitest config), so the
 * automated suite never requires a real Gemini call. It makes ONE real
 * structured request. Keep the question non-sensitive and synthetic.
 */
import { describe, it, expect } from "vitest";
import { GeminiEngine, checkGeminiHealth, geminiModel } from "@/lib/ai/GeminiEngine";

const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());

describe("manual Gemini integration smoke test (consumes quota)", () => {
  it.skipIf(!hasKey)("answers a non-sensitive public-service question", async () => {
    const engine = new GeminiEngine();
    const startedAt = Date.now();
    let httpStatus: number | undefined;
    let errorCategory: string | undefined;
    try {
      const result = await engine.answerQuestion({
        question: "Which documents are needed for an income certificate?",
        documentText: "",
        language: "en",
        evidence: [],
      });

      expect(result.answer.trim().length).toBeGreaterThan(0);
      expect(typeof result.grounded).toBe("boolean");

      const health = checkGeminiHealth();
      expect(health.lastOutcome).toBe("ok");
      expect(JSON.stringify(health)).not.toContain(String(process.env.GEMINI_API_KEY));
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          component: "gemini-live",
          event: "success",
          model: geminiModel(),
          elapsedMs: Date.now() - startedAt,
          answerChars: result.answer.length,
          health: health.ok,
        })
      );
    } catch (err) {
      const e = err as { httpStatus?: unknown; code?: unknown; name?: unknown };
      httpStatus = typeof e.httpStatus === "number" ? e.httpStatus : undefined;
      errorCategory = typeof e.code === "string" ? e.code : (typeof e.name === "string" ? e.name : undefined);
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          component: "gemini-live",
          event: "failure",
          model: geminiModel(),
          elapsedMs: Date.now() - startedAt,
          httpStatus,
          errorCategory,
          sanitizedMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        })
      );
      throw err;
    } finally {
      const health = checkGeminiHealth();
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          component: "gemini-live",
          event: "completed",
          model: geminiModel(),
          elapsedMs: Date.now() - startedAt,
          lastOutcome: health.lastOutcome,
          lastErrorKind: health.lastErrorKind,
          httpStatus,
          errorCategory,
        })
      );
    }
  });

  it.skipIf(!hasKey)("still refuses private content without a network call", async () => {
    const transport = async () => {
      throw new Error("transport must not be called for private content");
    };
    const engine = new GeminiEngine({ transport });
    await expect(
      engine.answerQuestion({
        question: "What is my case status?",
        documentText: "FIR No 45/2026, Survey No 12/3",
        language: "en",
        evidence: [],
      })
    ).rejects.toMatchObject({ code: "privacy" });
  });

  it.runIf(!hasKey)("reports that GEMINI_API_KEY is required", () => {
    throw new Error(
      "GEMINI_API_KEY is not set. Export it and run `npm run test:gemini` to execute " +
        "this manual smoke test. It makes one real Gemini request and may consume quota."
    );
  });
});
