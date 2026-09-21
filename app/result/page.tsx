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
import {
  apiAsk,
  apiCreateCase,
  apiTranslate,
  type ChecklistItem,
  type GovernmentSource,
  type Verification,
} from "../services/api";

export default function ResultPage() {
  const { lang } = usePortal();
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"en" | "te">("en");
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [docsChecked, setDocsChecked] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<ChecklistItem[]>([]);
  const [question, setQuestion] = useState("What documents do I need?");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [qa, setQa] = useState<QA[]>([]);
  const [creating, setCreating] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);

  const session = useMemo(() => (loaded ? getSession() : null), [loaded]);
  const extraction = session?.extraction ?? null;

  useEffect(() => {
    setLoaded(true);
    const s = getSession();
    setSteps(s.checklist);
    setQa(s.qa);
  }, []);

  useEffect(() => {
    setTab(lang === "te" ? "te" : "en");
  }, [lang ]);

  // POST /api/translate fallback when the analysis has no Telugu summary.
  useEffect(() => {
    if (tab !== "te" || !extraction || extraction.summaryTelugu || translated || translating) return;
    setTranslating(true);
    apiTranslate(extraction.summary, "te")
      .then((r) => setTranslated(r.translatedText))
      .catch(() => setTranslated(null))
      .finally(() => setTranslating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, extraction?.summary]);

  const ask = useCallback(
    async (q: string) => {
      const s = getSession();
      const text = q.trim();
      if (!text || asking) return;
      if (!s.sessionId && !s.text.trim()) return;
      setAsking(true);
      setAskError(null);
      try {
        // POST /api/ask — scoped to the current session server-side.
        const r = await apiAsk(text, {
          sessionId: s.sessionId ?? undefined,
          documentText: s.sessionId ? undefined : s.text,
          language: lang,
        });
        const entry: QA = { q: text, a: r.answer, grounded: r.grounded, sources: r.sources };
        setQa((prev) => {
          const next = [...prev, entry];
          updateSession({ qa: next });
          return next;
        });
        if (lang !== "en") {
          try {
            getVoiceService().speak(r.answer, lang);
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
    if (!s.extraction) return;
    setCreating(true);
    setCaseError(null);
    try {
      // POST /api/cases — built server-side from the session.
      if (!s.sessionId) throw new Error("Session expired. Analyze the document again.");
      const { case: c } = await apiCreateCase({ sessionId: s.sessionId, language: lang });
      updateSession({ caseId: c.id });
    } catch (err) {
      setCaseError(err instanceof Error ? err.message : "Could not create case.");
    } finally {
      setCreating(false);
    }
  }, [lang]);

  if (!loaded) {
    return (
      <main className="gov-container py-6">
        <p>Loading result…</p>
      </main>
    );
  }

  if (!extraction) {
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

  const refNo = extraction.referenceNumber ?? "—";
  const dept = extraction.organization ?? session?.sources[0]?.department ?? "—";
  const summary = tab === "te" ? extraction.summaryTelugu ?? translated ?? extraction.summary : extraction.summary;
  const caseId = session?.caseId ?? null;
  const metas: GovernmentSource[] = session?.sources ?? [];

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
        {session?.continuedAnyway && (
          <p role="alert" className="rounded-gov border border-gov-saffron bg-amber-50 p-3 text-sm font-bold text-amber-900">
            ⚠ You continued without confident verification — information below may not be
            government-specific. Confirm at the department counter.
          </p>
        )}
        {/* Document header */}
        <div className="gov-card border-t-4 border-t-gov-blue p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
                {extraction.title ?? extraction.documentType}
              </h1>
              {session?.fileName && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gov-muted">Document: <strong className="text-gov-navy">{session.fileName}</strong></span>
                  {session.fileType && (
                    <span className="gov-badge bg-gov-lightBlue text-gov-navy">Type: {session.fileType.toUpperCase()}</span>
                  )}
                </p>
              )}
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Department:</dt><dd>{dept}</dd></div>
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Reference No:</dt><dd className="font-mono">{refNo}</dd></div>
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Document Type:</dt><dd>{extraction.documentType}</dd></div>
                <div className="flex gap-2"><dt className="font-bold text-gov-muted">Language:</dt><dd>{extraction.language === "te" ? "తెలుగు" : "English"}</dd></div>
              </dl>
            </div>
            <StatusBadge status={session?.grounded ? "verified" : "unverified"} label={session?.grounded ? "✓ Grounded" : "⚠ Unverified"} />
          </div>
        </div>

        {/* What this document means */}
        <section aria-labelledby="meaning" className="overflow-hidden rounded-gov border border-gov-blue bg-gov-lightBlue shadow-gov">
          <h2 id="meaning" className="bg-gov-blue px-4 py-2 text-base font-extrabold uppercase tracking-wide text-white sm:text-lg">
            📄 What this document means
          </h2>
          <p className="p-4 text-base leading-relaxed">{extraction.summary}</p>
        </section>

        {/* Document check — AI-assisted verification (never authentication) */}
        {session?.verification && (
          <DocumentCheck verification={session.verification} />
        )}

        {/* Important information */}
        <section aria-labelledby="important" className="gov-card p-4">
          <h2 id="important" className="gov-section-title !border-gov-saffron !text-base">
            ⭐ Important Information
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="gov-table">
              <tbody>
                <tr><th scope="row" className="!w-40">Deadline</th><td className="font-bold">{extraction.deadline ?? "—"}</td></tr>
                <tr><th scope="row">Amount / Fee</th><td className="font-bold">{extraction.amount ?? "—"}</td></tr>
                <tr><th scope="row">Status</th><td><StatusBadge status={session?.grounded ? "verified" : "pending"} label={session?.grounded ? "Verified against official info" : "Needs verification"} /></td></tr>
                <tr><th scope="row">Reference No</th><td className="font-mono">{refNo}</td></tr>
              </tbody>
            </table>
          </div>
          {(!session?.grounded || extraction.warningSignals.length > 0) && (
            <div role="alert" className="mt-3 space-y-1.5 rounded-gov border border-gov-saffron bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">
                ⚠ Verification recommended — confirm at the department counter before acting.
              </p>
              {extraction.warningSignals.map((w) => (
                <p key={w} className="text-sm text-amber-900">• {w}</p>
              ))}
            </div>
          )}
        </section>

        {/* Documents required */}
        <section aria-labelledby="docs-req" className="gov-card p-4">
          <h2 id="docs-req" className="gov-section-title !text-base">🧾 Documents Required</h2>
          {extraction.requiredDocuments.length === 0 ? (
            <p className="mt-2 text-sm">
              No required-document list could be verified from the official information available
              to GovLens.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {extraction.requiredDocuments.map((d) => (
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
            {translating && tab === "te" && !extraction.summaryTelugu ? (
              <p className="text-sm text-gov-muted">Translating to Telugu with local AI…</p>
            ) : (
              <p className="text-base leading-relaxed">{summary}</p>
            )}
            {!extraction.summaryTelugu && !translated && tab === "te" && !translating && (
              <p className="mt-2 text-xs font-semibold text-amber-900">
                Telugu unavailable — showing English.
              </p>
            )}
            <VoiceOutput text={summary} lang={tab} />
          </div>
          {session?.explanation && (session.explanation.importantPoints.length > 0 || session.explanation.whatToDo.length > 0) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {session.explanation.importantPoints.length > 0 && (
                <div className="rounded-gov border border-gov-border bg-gov-offWhite p-3">
                  <h3 className="text-sm font-extrabold text-gov-navy">📌 Important points</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {session.explanation.importantPoints.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {session.explanation.whatToDo.length > 0 && (
                <div className="rounded-gov border border-gov-border bg-gov-offWhite p-3">
                  <h3 className="text-sm font-extrabold text-gov-navy">👉 What to do</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {session.explanation.whatToDo.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {session?.explanation?.verificationNote ? (
            <p className="mt-2 text-xs text-gov-muted">📝 {session.explanation.verificationNote}</p>
          ) : null}
        </section>

        {/* Voice Q&A */}
        <section aria-labelledby="ask" className="gov-card border-t-4 border-t-gov-green p-4">
          <h2 id="ask" className="gov-section-title !text-base">🎙 Ask About This Document</h2>
          <p className="mt-1 text-sm text-gov-muted">
            Regarding: <strong className="text-gov-navy">{extraction.documentType}</strong>
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
                <p className="mt-1 border-t border-gov-border pt-2"><span className="font-bold text-gov-greenDark">GovLens:</span> {entry.a}</p>
                <p className="mt-1 text-xs text-gov-muted">
                  {entry.grounded ? "✓ Grounded in official sources" : "⚠ Unverified"} ·{" "}
                  {entry.sources.map((s) => s.id).join(", ") || "no sources"}
                </p>
                <VoiceOutput text={entry.a} lang={lang} />
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
              <p className="text-sm">No official sources matched this document.</p>
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
                        <td>{m.documentType}</td>
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

const VERIFY_LABEL: Record<string, { text: string; cls: string }> = {
  verified: { text: "✓ Government/public-service document", cls: "bg-gov-lightGreen text-gov-greenDark" },
  likely_government: { text: "✓ Government/public-service document likely", cls: "bg-gov-lightGreen text-gov-greenDark" },
  uncertain: { text: "? Could not be verified", cls: "bg-amber-100 text-amber-900" },
  not_government: { text: "✕ Not a government document", cls: "bg-red-100 text-gov-red" },
};

function confidenceWord(v: Verification): string {
  if (v.confidence >= 0.8) return "High";
  if (v.confidence >= 0.5) return "Medium";
  return "Low";
}

function DocumentCheck({ verification }: { verification: Verification }) {
  const badge = VERIFY_LABEL[verification.status] ?? VERIFY_LABEL.uncertain;
  return (
    <section aria-labelledby="doc-check" className="gov-card border-t-4 border-t-gov-green p-4">
      <h2 id="doc-check" className="gov-section-title !text-base">🔍 Document Check</h2>
      <p className="mt-2">
        <span className={`gov-badge ${badge.cls}`}>{badge.text}</span>
      </p>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><dt className="font-bold text-gov-muted">Confidence:</dt><dd>{confidenceWord(verification)} ({Math.round(verification.confidence * 100)}%)</dd></div>
        <div className="flex gap-2"><dt className="font-bold text-gov-muted">Detected:</dt><dd>{verification.organization ?? "unknown organization"} · {verification.documentType}</dd></div>
        <div className="flex gap-2"><dt className="font-bold text-gov-muted">Matched official sources:</dt><dd className="font-bold">{verification.matchedSources.length}</dd></div>
      </dl>
      {verification.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
          {verification.reasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {verification.verificationWarnings.length > 0 && (
        <div className="mt-2 rounded-gov bg-amber-50 p-2 text-sm text-amber-900">
          {verification.verificationWarnings.slice(0, 3).map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}
      <p className="mt-2 border-t border-gov-border pt-2 text-xs text-gov-muted">
        Verification note: content is checked against official sources, but GovLens does not
        independently authenticate the physical document.
      </p>
    </section>
  );
}
