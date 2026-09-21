"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Breadcrumb from "../components/Breadcrumb";
import StatusBadge from "../components/StatusBadge";
import VoiceInput from "../components/VoiceInput";
import VoiceOutput from "../components/VoiceOutput";
import { usePortal } from "../components/PortalProvider";
import { QA_EXAMPLES } from "../lib/portal-data";
import { getVoiceService } from "../lib/voice-service";
import { getSession, updateSession, type QA } from "../lib/session-store";
import { apiAsk, apiCreateCase, apiSourceMetadata } from "../services/api";
import type { ChecklistItem } from "../types/checklist-item";

interface SourceMeta {
  id: string;
  title: string;
  department: string;
  state: string;
  type: string;
  sourceUrl: string;
  lastVerified: string;
}

export default function ResultPage() {
  const { lang } = usePortal();
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"en" | "te">("en");
  const [docsChecked, setDocsChecked] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<ChecklistItem[]>([]);
  const [question, setQuestion] = useState("What documents do I need?");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [qa, setQa] = useState<QA[]>([]);
  const [metas, setMetas] = useState<SourceMeta[]>([]);
  const [creating, setCreating] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);

  const session = useMemo(() => (loaded ? getSession() : null), [loaded]);
  const analysis = session?.analysis ?? null;

  useEffect(() => {
    setLoaded(true);
    const s = getSession();
    setSteps(s.checklist);
    setQa(s.qa);
    if (s.analysis?.sources?.length) {
      apiSourceMetadata(s.analysis.sources.map((x) => x.id))
        .then((r) => setMetas(r.sources))
        .catch(() => setMetas([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTab(lang === "te" ? "te" : "en");
  }, [lang]);

  const ask = useCallback(
    async (q: string) => {
      const s = getSession();
      const text = q.trim();
      if (!text || !s.text.trim() || asking) return;
      setAsking(true);
      setAskError(null);
      try {
        const { answer } = await apiAsk(text, s.text, lang);
        const entry = { q: text, a: answer };
        setQa((prev) => {
          const next = [...prev, entry];
          updateSession({ qa: next });
          return next;
        });
        if (lang !== "en") {
          try {
            getVoiceService().speak(answer.text, lang);
          } catch {
            /* best-effort */
          }
        }
      } catch (err) {
        setAskError(err instanceof Error ? err.message : "Could not answer.");
      } finally {
        setAsking(false);
      }
    },
    [asking, lang]
  );

  const createCase = useCallback(async () => {
    const s = getSession();
    if (!s.analysis) return;
    setCreating(true);
    setCaseError(null);
    try {
      const { case: c } = await apiCreateCase({
        documentText: s.text,
        ocrConfidence: s.ocr?.confidence,
        analysis: s.analysis,
        evidence: s.evidence,
        checklist: steps,
        language: lang,
      });
      updateSession({ caseId: c.id });
    } catch (err) {
      setCaseError(err instanceof Error ? err.message : "Could not create case.");
    } finally {
      setCreating(false);
    }
  }, [steps, lang]);

  if (!loaded) {
    return (
      <main className="gov-container py-6">
        <p>Loading result…</p>
      </main>
    );
  }

  if (!analysis) {
    return (
      <main id="main-content">
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Documents", href: "/documents" },
            { label: "Result" },
          ]}
        />
        <div className="gov-container mt-2 pb-6">
          <div className="gov-card p-6 text-center">
            <p className="text-xl font-extrabold text-gov-navy">No document analysed yet</p>
            <p className="mt-1 text-sm text-gov-muted">
              Scan a document first — GovLens will explain it here with official sources.
            </p>
            <Link href="/scan" className="gov-btn-primary mt-4">
              📷 Scan a Document
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const f = analysis.extractedFields;
  const refNo = f.applicationId ?? "—";
  const dept = f.officeOrDepartment ?? analysis.sources[0]?.department ?? "—";
  const deadlines = f.deadlines.length ? f.deadlines : ["—"];
  const amounts = f.amounts.length ? f.amounts : ["—"];
  const summary = tab === "te" && analysis.summaryTelugu ? analysis.summaryTelugu : analysis.summary;
  const caseId = session?.caseId ?? null;

  return (
    <main id="main-content">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Documents", href: "/documents" },
          { label: "Scan", href: "/scan" },
          { label: "Result" },
        ]}
      />

      <div className="gov-container mt-2 space-y-4 pb-6">
        {/* Document header */}
        <div className="gov-card border-t-4 border-t-gov-blue p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
                {analysis.documentType}
              </h1>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Department:</dt><dd>{dept}</dd></div>
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Reference No:</dt><dd className="font-mono">{refNo}</dd></div>
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Document Type:</dt><dd>{f.documentType ?? analysis.documentType}</dd></div>
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Language:</dt><dd>{analysis.language === "te" ? "తెలుగు" : "English"}</dd></div>
              </dl>
            </div>
            <StatusBadge status={analysis.verified ? "verified" : "unverified"} label={analysis.verified ? "✓ Grounded" : "⚠ Unverified"} />
          </div>
        </div>

        {/* What this document means */}
        <section aria-labelledby="meaning" className="overflow-hidden rounded-gov border border-gov-blue bg-gov-lightBlue shadow-gov">
          <h2 id="meaning" className="bg-gov-blue px-4 py-2 text-base font-extrabold uppercase tracking-wide text-white sm:text-lg">
            📄 What this document means
          </h2>
          <p className="p-4 text-base leading-relaxed">{analysis.summary}</p>
        </section>

        {/* Important information */}
        <section aria-labelledby="important" className="gov-card p-4">
          <h2 id="important" className="gov-section-title !border-gov-saffron !text-base">
            ⭐ Important Information
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="gov-table">
              <tbody>
                <tr><th scope="row" className="!w-40">Deadline</th><td className="font-bold">{deadlines.join("; ")}</td></tr>
                <tr><th scope="row">Amount / Fee</th><td className="font-bold">{amounts.join("; ")}</td></tr>
                <tr><th scope="row">Status</th><td><StatusBadge status={analysis.verified ? "verified" : "pending"} label={analysis.verified ? "Verified against official info" : "Needs verification"} /></td></tr>
                <tr><th scope="row">Reference No</th><td className="font-mono">{refNo}</td></tr>
              </tbody>
            </table>
          </div>
          {!analysis.verified && (
            <p role="alert" className="mt-3 rounded-gov border border-gov-saffron bg-amber-50 p-3 text-sm font-bold text-amber-900">
              ⚠ Verification recommended — parts of this explanation could not be confirmed from
              official information. Confirm at the department counter before acting.
            </p>
          )}
        </section>

        {/* Documents required */}
        <section aria-labelledby="docs-req" className="gov-card p-4">
          <h2 id="docs-req" className="gov-section-title !text-base">🧾 Documents Required</h2>
          {f.requiredDocuments.length === 0 ? (
            <p className="mt-2 text-sm">
              No required-document list could be verified from the official information available
              to GovLens.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {f.requiredDocuments.map((d) => (
                <li key={d} className="flex items-start gap-3 rounded-gov border border-gov-border bg-gov-offWhite p-3">
                  <input
                    type="checkbox"
                    checked={!!docsChecked[d]}
                    onChange={() => setDocsChecked((p) => ({ ...p, [d]: !p[d] }))}
                    aria-label={`Arrange: ${d}`}
                    className="mt-1 h-6 w-6 shrink-0 accent-[#2E8B57]"
                  />
                  <span className={`font-semibold ${docsChecked[d] ? "line-through opacity-60" : ""}`}>{d}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Action steps */}
        {steps.length > 0 && (
          <section aria-labelledby="steps" className="gov-card p-4">
            <h2 id="steps" className="gov-section-title !text-base">✅ What You Need To Do</h2>
            <ol className="mt-3 space-y-2">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3 rounded-gov border border-gov-border bg-gov-offWhite p-3">
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gov-green text-sm font-extrabold text-white">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className={`font-bold text-gov-navy ${s.done ? "line-through opacity-60" : ""}`}>{s.label}</p>
                    {s.detail && <p className="text-sm text-gov-muted">{s.detail}</p>}
                  </div>
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={() => {
                      const next = steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x));
                      setSteps(next);
                      updateSession({ checklist: next });
                    }}
                    aria-label={`Mark done: ${s.label}`}
                    className="mt-1 h-6 w-6 shrink-0 accent-[#2E8B57]"
                  />
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* AI explanation tabs */}
        <section aria-labelledby="ai-expl" className="gov-card p-4">
          <h2 id="ai-expl" className="gov-section-title !text-base">🤖 AI Explanation</h2>
          <div role="tablist" aria-label="Explanation language" className="mt-3 flex gap-1 border-b border-gov-border">
            {(["en", "te"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-[44px] rounded-t-gov border border-b-0 border-gov-border px-5 text-base font-bold ${
                  tab === t ? "bg-gov-blue text-white" : "bg-gov-offWhite text-gov-blue"
                }`}
              >
                {t === "en" ? "English" : "తెలుగు"}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="rounded-b-gov border border-gov-border bg-gov-offWhite p-4">
            <p className="text-base leading-relaxed">{summary}</p>
            {!analysis.summaryTelugu && tab === "te" && (
              <p className="mt-2 text-xs font-semibold text-amber-900">
                Telugu summary unavailable for this analysis — showing English.
              </p>
            )}
            <VoiceOutput text={tab === "te" && analysis.summaryTelugu ? analysis.summaryTelugu : analysis.summary} lang={tab} />
          </div>
        </section>

        {/* Voice Q&A */}
        <section aria-labelledby="ask" className="gov-card border-t-4 border-t-gov-green p-4">
          <h2 id="ask" className="gov-section-title !text-base">🎙 Ask About This Document</h2>
          <p className="mt-1 text-sm text-gov-muted">
            Regarding: <strong className="text-gov-navy">{analysis.documentType}</strong>
            {refNo !== "—" && <> · Ref: <span className="font-mono">{refNo}</span></>}
          </p>

          <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <VoiceInput
              lang={lang}
              large
              onTranscript={(t) => {
                setQuestion(t);
                ask(t);
              }}
            />
            <div className="w-full flex-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") ask(question);
                  }}
                  aria-label="Your question about this document"
                  placeholder="Ask e.g. What documents do I need?"
                  className="gov-input"
                />
                <button type="button" onClick={() => ask(question)} disabled={asking || !question.trim()} className="gov-btn-primary shrink-0">
                  {asking ? "…" : "Ask"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Example questions">
                {QA_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setQuestion(ex);
                      ask(ex);
                    }}
                    className="rounded-gov border border-gov-blue bg-gov-lightBlue px-2.5 py-1.5 text-xs font-bold text-gov-blue hover:bg-blue-100"
                  >
                    “{ex}”
                  </button>
                ))}
              </div>
            </div>
          </div>

          {askError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-gov-red">{askError}</p>
          )}

          <div className="mt-3 space-y-2" aria-live="polite">
            {qa.map((entry, i) => (
              <div key={i} className="rounded-gov border border-gov-border p-3">
                <p className="text-sm"><span className="font-bold text-gov-navy">You asked:</span> {entry.q}</p>
                <p className="mt-1 border-t border-gov-border pt-2"><span className="font-bold text-gov-greenDark">GovLens:</span> {entry.a.text}</p>
                <p className="mt-1 text-xs text-gov-muted">
                  {entry.a.verified ? "✓ Grounded in official sources" : "⚠ Unverified"} ·{" "}
                  {entry.a.sources.map((s) => s.id).join(", ") || "no sources"}
                </p>
                <VoiceOutput text={entry.a.text} lang={lang} />
              </div>
            ))}
          </div>
        </section>

        {/* Official information — visually distinct */}
        <section aria-labelledby="official" className="overflow-hidden rounded-gov border-2 border-gov-green shadow-gov">
          <h2 id="official" className="bg-gov-green px-4 py-2 text-base font-extrabold uppercase tracking-wide text-white sm:text-lg">
            🏛 Official Information <span className="font-semibold normal-case">(not AI-generated)</span>
          </h2>
          <div className="bg-gov-lightGreen p-4">
            {metas.length === 0 ? (
              <ul className="space-y-2">
                {analysis.sources.map((s) => (
                  <li key={s.id} className="rounded-gov border border-gov-green bg-white p-3 text-sm">
                    <p className="font-bold">{s.title}</p>
                    <p className="font-mono text-xs text-gov-muted">source id: {s.id}</p>
                  </li>
                ))}
                {analysis.sources.length === 0 && <li className="text-sm">No official sources matched.</li>}
              </ul>
            ) : (
              <div className="overflow-x-auto rounded-gov border border-gov-green bg-white">
                <table className="gov-table">
                  <thead>
                    <tr><th>Source</th><th>Department</th><th>State</th><th>Type</th><th>Last Verified</th><th>Link</th></tr>
                  </thead>
                  <tbody>
                    {metas.map((m) => (
                      <tr key={m.id}>
                        <td className="font-bold">{m.title}<br /><span className="font-mono text-xs font-normal text-gov-muted">{m.id}</span></td>
                        <td>{m.department}</td>
                        <td>{m.state}</td>
                        <td>{m.type}</td>
                        <td>{m.lastVerified}</td>
                        <td className="max-w-[140px] truncate"><span className="text-xs text-gov-muted">{m.sourceUrl}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Create case */}
        <div className="gov-card p-4">
          {caseError && (
            <p role="alert" className="mb-2 rounded-gov border border-gov-red bg-red-50 p-3 text-sm font-semibold text-gov-red">
              {caseError}
            </p>
          )}
          {!caseId ? (
            <button type="button" onClick={createCase} disabled={creating} className="gov-btn-saffron w-full !text-lg">
              {creating ? "Creating case…" : "📁 Create Case for Caseworker"}
            </button>
          ) : (
            <div className="rounded-gov border border-gov-green bg-gov-lightGreen p-3 text-center">
              <p className="font-extrabold text-gov-greenDark">✓ Case created and sent to the caseworker</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link href="/caseworker" className="gov-btn-primary">Open Caseworker Portal →</Link>
                <Link href="/documents" className="gov-btn-outline">View My Documents</Link>
              </div>
            </div>
          )}
          <div className="mt-2 text-center">
            <Link href="/scan" className="text-sm font-bold text-gov-blue hover:underline">← Scan another document</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
