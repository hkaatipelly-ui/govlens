import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateFile,
  sanitizeFileName,
  IngestionError,
  MAX_FILE_SIZE,
} from "@/app/lib/ingestion";

function file(name: string, type = "", size?: number): File {
  const path = join(__dirname, "fixtures", name);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch {
    bytes = new Uint8Array([1, 2, 3]);
  }
  const blob = new Blob([bytes], { type });
  return new File([blob], name, { type, lastModified: Date.now() });
}

describe("validateFile (extension + MIME)", () => {
  it.each([
    ["scan.png", "image/png", "png"],
    ["photo.jpg", "image/jpeg", "jpg"],
    ["photo.jpeg", "image/jpeg", "jpeg"],
    ["doc.pdf", "application/pdf", "pdf"],
    ["form.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ])("accepts %s", (name, mime, expected) => {
    expect(validateFile(file(name, mime))).toBe(expected);
  });

  it("accepts .jpg even with empty/wrong MIME (browser inconsistency)", () => {
    expect(validateFile(file("photo.jpg", ""))).toBe("jpg");
    expect(validateFile(file("photo.JPG", "application/octet-stream"))).toBe("jpg");
  });

  it("rejects unsupported TXT with a useful message", () => {
    try {
      validateFile(file("notes.txt", "text/plain"));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(IngestionError);
      expect((err as Error).message).toContain("PDF, DOCX, JPG, JPEG or PNG");
    }
  });

  it("rejects oversized files", () => {
    const big = new File([new Uint8Array([1])], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_FILE_SIZE + 1 });
    expect(() => validateFile(big)).toThrowError(/too large/i);
  });

  it("sanitizes file names (no paths, no odd chars)", () => {
    expect(sanitizeFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("my notice (1).PDF")).toContain("my notice");
  });
});

describe("DOCX normalization (mammoth, server-safe path)", () => {
  it("extracts text from a gov DOCX", async () => {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ path: join(__dirname, "fixtures", "gov-application.docx") });
    expect(out.value).toContain("MSC2026001234");
    expect(out.value).toContain("MeeSeva");
  });

  it("empty DOCX yields empty text (route maps to controlled error)", async () => {
    const mammoth = await import("mammoth");
    const out = await mammoth.extractRawText({ path: join(__dirname, "fixtures", "empty.docx") });
    expect(out.value.trim()).toBe("");
  });

  it("corrupt DOCX throws (route maps to controlled error)", async () => {
    const mammoth = await import("mammoth");
    await expect(
      mammoth.extractRawText({ path: join(__dirname, "fixtures", "corrupt.docx") })
    ).rejects.toThrow();
  });
});

describe("PDF fixture sanity", () => {
  it("text PDF fixture is a valid PDF with extractable text", () => {
    const bytes = readFileSync(join(__dirname, "fixtures", "gov-notice.pdf"));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("MSC2026001234");
  });

  it("pdf.js extracts the text layer (same library the browser uses)", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
    const data = new Uint8Array(readFileSync(join(__dirname, "fixtures", "gov-notice.pdf")));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true })
      .promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>)
      .map((i) => i.str ?? "")
      .join(" ");
    expect(text).toContain("MSC2026001234");
    expect(text).toContain("MeeSeva");
  }, 30000);

  it("corrupt PDF fixture is not parseable text", () => {
    const bytes = readFileSync(join(__dirname, "fixtures", "corrupt.pdf"));
    expect(bytes.toString("latin1")).not.toContain("endobj");
  });
});
