"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Breadcrumb from "../components/Breadcrumb";
import CameraCapture from "../components/CameraCapture";
import DocumentUploader from "../components/DocumentUploader";
import OCRViewer from "../components/OCRViewer";
import { getOCRService } from "../lib/ocr-service";
import { updateSession } from "../lib/session-store";
import { fileToDownscaledDataUrl } from "../lib/image";
import { apiAnalyze, type AnalyzeResponse, type AnalyzeStage } from "../services/api";
import type { Verification } from "@/lib/verification/schemas";

type Phase = "capture" | "reading" | "review" | "understanding" | "gate";

const STAGE_ORDER: AnalyzeStage[] = [
  "reading",
  "checking-type",
  "finding-info",
  "understanding",
  "explaining",
];

const STAGE_LABELS: Record<AnalyzeStage, string> = {
  reading: "Reading document",
  "checking-type": "Checking document type",
  "finding-info": "Finding official information",
  understanding: "Understanding document",
  explaining: "Preparing explanation",
};

function ScanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uploadRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);

  const [phase, setPhase] = useState<Phase>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveStage, setLiveStage] = useState<AnalyzeStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<{ verification: Verification; result: AnalyzeResponse } | null>(null);

  const mode = searchParams.get("mode");

  useEffect(() => {
    if (mode === "upload") uploadRef.current?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runOcr = useCallback(async (file: File) => {
    setPhase("reading");
    setOcrError(null);
    setOcrProgress(0);
    setError(null);
    setGate(null);
    setText("");
    fileRef.current = file;
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

  const commitResult = useCallback(
    (result: AnalyzeResponse, continuedAnyway: boolean) => {
      updateSession({
        sessionId: result.sessionId,
        imageUrl,
        text,
        cleanedText: result.cleanedText,
        extraction: result.extraction,
        verification: result.verification,
        explanation: result.explanation,
        continuedAnyway,
        grounded: result.grounded,
        evidence: [],
        sources: result.sources,
        checklist: result.checklist,
        qa: [],
        caseId: null,
      });
      router.push("/result");
    },
    [imageUrl, text, router]
  );

  const analyze = useCallback(async () => {
    if (!text.trim()) {
      setError("There is no document text to understand yet. Capture a photo or type the text.");
      return;
    }
    setBusy(true);
    setError(null);
    setGate(null);
    setPhase("understanding");
    setLiveStage("reading");
    try {
      // Downscaled image for Gemma vision verification (best-effort).
      let imageDataUrl: string | undefined;
      try {
        if (fileRef.current) imageDataUrl = await fileToDownscaledDataUrl(fileRef.current);
      } catch {
        /* vision is optional; text pipeline continues */
      }
      // POST /api/analyze — streams honest progress, then verification + analysis.
      const result = await apiAnalyze(text, {
        language: "en",
        imageDataUrl,
        onStage: (stage) => setLiveStage(stage),
      });
      const status = result.verification.status;
      if (status === "uncertain" || status === "not_government") {
        // Verification gate: do NOT show the full result page yet.
        setGate({ verification: result.verification, result });
        setPhase("gate");
      } else {
        commitResult(result, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not understand the document.");
      setPhase("review");
    } finally {
      setBusy(false);
      setLiveStage(null);
    }
  }, [text, commitResult]);

  useEffect(() => {
    if (ocrConfidence !== undefined) {
      updateSession({
        ocr: { rawText: text, cleanedText: text, language: "mixed", confidence: ocrConfidence },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocrConfidence]);

  const liveIndex = liveStage ? STAGE_ORDER.indexOf(liveStage) : -1;

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
            this device, checks the document type with local AI, and explains it in simple language.
          </p>

          {(phase !== "capture" || imageUrl) && phase !== "gate" && (
            <ol aria-label="Processing status" className="mt-4 space-y-1.5" aria-live="polite">
              <li className="flex items-center gap-2 text-sm">
                <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-gov-green text-xs font-extrabold text-white">✓</span>
                <span className="font-bold text-gov-navy">Document captured</span>
              </li>
              {STAGE_ORDER.map((stage, i) => {
                const reached = liveIndex >= i;
                const active = liveIndex === i && busy;
                return (
                  <li key={stage} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                        reached && !active ? "bg-gov-green" : active ? "animate-pulse bg-gov-blue" : "bg-slate-300"
                      }`}
                    >
                      {reached && !active ? "✓" : i + 2}
                    </span>
                    <span className={reached ? "font-bold text-gov-navy" : "text-gov-muted"}>
                      {STAGE_LABELS[stage]}{active ? "…" : ""}
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
              {busy ? "Checking & understanding…" : "Understand Document →"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("capture");
                setImageUrl(null);
                setText("");
                setOcrError(null);
                setError(null);
                fileRef.current = null;
              }}
              disabled={busy}
              className="gov-btn-outline"
            >
              Retake
            </button>
          </div>
        )}

        {phase === "gate" && gate && (
          <VerificationGate
            verification={gate.verification}
            onContinue={() => commitResult(gate.result, true)}
            onRescan={() => {
              setGate(null);
              setPhase("capture");
              setImageUrl(null);
              setText("");
              fileRef.current = null;
            }}
          />
        )}

        <section aria-label="Instructions" className="gov-card p-4">
          <h2 className="gov-section-title !text-base">📋 Instructions</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>Place the document on a flat surface in good light.</li>
            <li>Keep the full page inside the frame; avoid shadows and blur.</li>
            <li>After capture, check the extracted text and correct mistakes.</li>
            <li>Tap <strong>Understand Document</strong> — GovLens first checks the document type, then explains it with official sources.</li>
            <li>English / తెలుగు / हिन्दी questions can be asked on the result screen.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}

function VerificationGate({
  verification,
  onContinue,
  onRescan,
}: {
  verification: Verification;
  onContinue: () => void;
  onRescan: () => void;
}) {
  const notGov = verification.status === "not_government";
  return (
    <section aria-label="Document check result" className="gov-card border-t-4 border-t-gov-saffron p-4">
      <h2 className="gov-section-title !border-gov-saffron !text-base">🔍 Document Check</h2>
      {notGov ? (
        <p className="mt-2 font-bold text-gov-red">
          This document does not appear to be a government or public-service document.
        </p>
      ) : (
        <p className="mt-2 font-bold text-amber-900">
          GovLens couldn&apos;t confidently verify that this is a government/public-service document.
        </p>
      )}
      <div className="mt-2 text-sm">
        <p><strong>Detected:</strong> {verification.organization ?? "unknown organization"} · {verification.documentType}</p>
        <p><strong>Confidence:</strong> {Math.round(verification.confidence * 100)}%</p>
      </div>
      {verification.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
          {verification.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {verification.verificationWarnings.length > 0 && (
        <div className="mt-2 rounded-gov bg-amber-50 p-2 text-sm text-amber-900">
          {verification.verificationWarnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}
      {!notGov && (
        <>
          <button type="button" onClick={onContinue} className="gov-btn-saffron mt-3 w-full">
            Continue anyway →
          </button>
          <p className="mt-1 text-center text-xs text-gov-muted">
            Information may not be government-specific.
          </p>
        </>
      )}
      <button type="button" onClick={onRescan} className="gov-btn-outline mt-2 w-full">
        {notGov ? "Scan a different document" : "Rescan"}
      </button>
    </section>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<main className="gov-container py-6"><p>Loading scan…</p></main>}>
      <ScanForm />
    </Suspense>
  );
}
