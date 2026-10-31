/** Request validation for all /api routes (server-only). */
import { z } from "zod";

// NOTE: extracted document text has NO application character ceiling — large
// documents are preserved in full. (No .max() here by design.)
const textField = z.string().trim().min(1);

export const analyzeRequestSchema = z.object({
  text: textField,
  language: z.enum(["en", "te", "hi"]).optional().default("en"),
  sessionId: z.string().trim().min(1).max(128).optional(),
  /** Optional downscaled JPEG data URL for Gemma vision verification. */
  imageDataUrl: z.string().trim().min(100).max(1000000).optional(),
  fileName: z.string().trim().min(1).max(120).optional(),
  fileType: z.enum(["pdf", "docx", "jpeg", "jpg", "png"]).optional(),
  cloudConsent: z.boolean().optional(),
});

export const createGrievanceRequestSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  category: z.string().trim().min(1).max(80),
  location: z.string().trim().max(200).optional(),
  source: z.string().trim().max(60).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(1).max(120),
        size: z.number().int().min(0).max(10 * 1024 * 1024),
        storagePath: z.string().trim().min(1).max(500),
      })
    )
    .max(10)
    .optional(),
  language: z.enum(["en", "te", "hi"]).optional(),
  idempotencyKey: z.string().trim().min(8).max(64).optional(),
});

export const askRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(128).optional(),
  question: z.string().trim().min(1).max(2000),
  // Compat: older clients send documentText instead of sessionId.
  documentText: z.string().trim().optional(),
  language: z.enum(["en", "te", "hi"]).optional().default("en"),
});

export const translateRequestSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  targetLanguage: z.enum(["en", "te"]),
});

export const createCaseRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(128).optional(),
  // Full-payload clients (older frontend) may send everything directly.
  documentText: z.string().trim().optional(),
  title: z.string().trim().max(300).optional(),
  language: z.enum(["en", "te", "hi"]).optional(),
  userNote: z.string().trim().max(2000).optional(),
  fileName: z.string().trim().min(1).max(120).optional(),
  fileType: z.enum(["pdf", "docx", "jpeg", "jpg", "png"]).optional(),
});

export const updateCaseRequestSchema = z.object({
  status: z.enum(["open", "needs_review", "completed"]),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type AskRequest = z.infer<typeof askRequestSchema>;
export type TranslateRequest = z.infer<typeof translateRequestSchema>;
export type CreateCaseRequest = z.infer<typeof createCaseRequestSchema>;
export type UpdateCaseRequest = z.infer<typeof updateCaseRequestSchema>;

/** Parse helper returning a 400-shaped error instead of throwing raw Zod errors. */
export function parseOrError<T>(schema: z.ZodType<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; message: string } {
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    message: `Invalid request: ${first?.path.join(".") || "body"} — ${first?.message || "validation failed"}`,
  };
}
