"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Breadcrumb from "../components/Breadcrumb";
import CameraCapture from "../components/CameraCapture";
import DocumentUploader from "../components/DocumentUploader";
import OCRViewer from "../components/OCRViewer";
import { getOCRService } from "../lib/ocr-service";
import { getActionEngine } from "../lib/action-engine";
import { updateSession } from "../lib/session-store";
import { apiAnalyze } from "../services/api";

type Phase = "capture" | "reading" | "review" | "understanding";

const PROCESS_STEPS = [
  "Document captured",
  "Reading document",
  "Understanding content",
  "Checking official information",
];

function ScanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uploadRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = searchParams.get("mode");

  // ?mode=upload opens the file picker directly (from Home hero)
  useEffect(() => {
    if (mode === "upload") uploadRef.current?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runOcr = useCallback(async (file: File) => {
    setPhase("reading");
    setOcrError(null);
    setOcrProgress(0);
    setError(null);
    setText("");
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    try {
      const result = await getOCRService().recognize(file, ["eng", "tel"], (p) =>
        setOcrProgress(p)
      );
      setText(result.cleanedText);
      setOcrConfidence(result.confidence);
      if (!result.cleanedText) setOcrError("No text detected in this photo.");
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "OCR failed.");
    } finally {
      setOcrProgress(null);
      setPhase("review");
    }
  }, []);

  const stepIndex =
    phase === "capture" ? 0 : phase === "reading" ? 1 : phase === "understanding" ? 3 : 1;

  const analyze = useCallback(async () => {
    if (!text.trim()) {
      setError("There is no document text to understand yet. Capture a photo or type the text.");
      return;
    }
    setBusy(true);
    setError(null);
    setPhase("understanding");
    try {
      const { analysis, evidence } = await apiAnalyze(text, "en");
      const checklist = getActionEngine().buildChecklist(analysis, evidence);
      updateSession({
        imageUrl,
        ocr: null,
        text,
        analysis,
        evidence,
        checklist,
        qa: [],
        caseId: null,
      });
      // persist OCR confidence alongside
      const { getSession } = await import("../lib/session-store");
      updateSession({ ocr: getSession().ocr });
      router.push("/result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not understand the document.");
      setPhase("review");
    } finally {
      setBusy(false);
    }
  }, [text, imageUrl, router]);

  // keep OCR confidence in session
  useEffect(() => {
    if (ocrConfidence !== undefined) {
      updateSession({
        ocr: { rawText: text, cleanedText: text, language: "mixed", confidence: ocrConfidence },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocrConfidence]);

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Documents", href: "/documents" }, { label: "Scan" }]} />

      <div className="gov-container mt-2 space-y-4 pb-4">
        <div className="gov-card border-t-4 border-t-gov-blue p-4 sm:p-6">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
            Scan Government Document
          </h1>
          <p className="mt-1 text-sm text-gov-muted">
            Take a photo of your notice, form, certificate or receipt. GovLens reads it on
            this device and explains it in simple language.
          </p>

          {/* Processing state tracker */}
          {(phase !== "capture" || imageUrl) && (
            <ol aria-label="Processing status" className="mt-4 space-y-1.5">
              {PROCESS_STEPS.map((label, i) => {
                const done = i < stepIndex || (phase === "review" && i <= 1);
                const active =
                  (phase === "reading" && i === 1) || (phase === "understanding" && i >= 2);
                return (
                  <li key={label} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                        done ? "bg-gov-green" : active ? "animate-pulse bg-gov-blue" : "bg-slate-300"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className={done || active ? "font-bold text-gov-navy" : "text-gov-muted"}>
                      {label}
                      {active && phase === "understanding" && i === 3 ? "…" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {phase === "capture" && !imageUrl && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CameraCapture onCapture={runOcr} />
              <DocumentUploader onSelect={runOcr} />
            </div>
          )}
        </div>

        {/* Hidden direct-upload input for ?mode=upload */}
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) runOcr(f);
            e.target.value = "";
          }}
        />

        {(phase === "reading" || phase === "review" || phase === "understanding") &&
          (imageUrl || text || ocrProgress !== null) && (
            <OCRViewer
              imageUrl={imageUrl}
              ocr={null}
              ocrProgress={ocrProgress}
              ocrError={ocrError}
              editableText={text}
              onTextChange={setText}
            />
          )}

        {error && (
          <p role="alert" className="rounded-gov border border-gov-red bg-red-50 p-3 text-sm font-semibold text-gov-red">
            {error}
          </p>
        )}

        {(phase === "review" || phase === "understanding") && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={analyze}
              disabled={busy || !text.trim()}
              className="gov-btn-primary flex-1 !text-lg"
            >
              {busy ? "Understanding document…" : "Understand Document →"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("capture");
                setImageUrl(null);
                setText("");
                setOcrError(null);
                setError(null);
              }}
              disabled={busy}
              className="gov-btn-outline"
            >
              Retake
            </button>
          </div>
        )}

        <section aria-label="Instructions" className="gov-card p-4">
          <h2 className="gov-section-title !text-base">📋 Instructions</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>Place the document on a flat surface in good light.</li>
            <li>Keep the full page inside the frame; avoid shadows and blur.</li>
            <li>After capture, check the extracted text and correct mistakes.</li>
            <li>Tap <strong>Understand Document</strong> — local AI explains it and lists next steps.</li>
            <li>English / తెలుగు / हिन्दी questions can be asked on the result screen.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<main className="gov-container py-6"><p>Loading scan…</p></main>}>
      <ScanForm />
    </Suspense>
  );
}
