"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/app/components/Breadcrumb";
import StatusBadge from "@/app/components/StatusBadge";
import CaseStatusUpdater from "@/app/components/CaseStatusUpdater";
import { apiGetCase, type Case, type CaseStatus } from "@/app/services/api";

/** Case detail reads GET /api/cases/:id (never the DB directly). */
export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const [caseData, setCaseData] = useState<Case | null | undefined>(undefined);

  useEffect(() => {
    apiGetCase(params.id)
      .then((r) => setCaseData(r.case))
      .catch((e) => {
        if (e instanceof Error && /404|not found/i.test(e.message)) setCaseData(null);
        else setCaseData(null);
      });
  }, [params.id]);

  if (caseData === undefined) {
    return (
      <main className="gov-container py-6">
        <p>Loading case file…</p>
      </main>
    );
  }
  if (caseData === null) notFound();

  return (
    <main id="main-content">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Caseworker", href: "/caseworker" },
          { label: caseData.title },
        ]}
      />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card space-y-3 border-t-4 border-t-gov-navy p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-extrabold text-gov-navy">Case File — {caseData.title}</h1>
              <p className="mt-0.5 font-mono text-xs text-gov-muted">
                ID: {caseData.id} · Session: {caseData.sessionId.slice(0, 8)}
              </p>
            </div>
            <StatusBadge status={caseData.status} />
          </div>
          <CaseStatusUpdater
            caseId={caseData.id}
            initial={caseData.status}
            onChanged={(s: CaseStatus) => setCaseData({ ...caseData, status: s })}
          />
        </div>

        {caseData.verification && (
          <section aria-label="Document verification" className="gov-card border-t-4 border-t-gov-green p-4">
            <h2 className="gov-section-title !text-base">🔍 Document Verification</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge
                status={caseData.verification.status === "not_government" ? "unverified" : caseData.verification.status === "uncertain" ? "pending" : "verified"}
                label={`Government status: ${caseData.verification.status.replace(/_/g, " ")}`}
              />
              <span className="text-gov-muted">
                Confidence {Math.round(caseData.verification.confidence * 100)}% ·
                Evidence: {caseData.verification.matchedSources.length} official source match(es) ·
                Verification warnings: {caseData.verification.verificationWarnings.length}
              </span>
            </div>
            {(caseData.verification.organization || caseData.verification.documentType) && (
              <p className="mt-1 text-sm">
                Detected: <strong>{caseData.verification.organization ?? "unknown organization"}</strong> · {caseData.verification.documentType}
              </p>
            )}
            {caseData.verification.verificationWarnings.slice(0, 3).map((w) => (
              <p key={w} className="mt-1 text-sm text-amber-900">⚠ {w}</p>
            ))}
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* LEFT: original document */}
          <section aria-label="Original document" className="gov-card h-fit overflow-hidden">
            <h2 className="border-b border-gov-border bg-gov-offWhite px-4 py-2.5 font-extrabold text-gov-navy">
              📄 Original Document
            </h2>
            <div className="space-y-3 p-4">
              <div className="overflow-x-auto">
                <table className="gov-table">
                  <tbody>
                    <tr><th scope="row" className="!w-36">Received</th><td>{new Date(caseData.createdAt).toLocaleString("en-IN")}</td></tr>
                    <tr><th scope="row">Updated</th><td>{new Date(caseData.updatedAt).toLocaleString("en-IN")}</td></tr>
                    <tr><th scope="row">Language</th><td>{caseData.language === "te" ? "తెలుగు" : caseData.language === "hi" ? "हिन्दी" : "English"}</td></tr>
                    <tr><th scope="row">Document type</th><td>{caseData.documentType}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gov-navy">Original OCR text</h3>
                <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-gov border border-gov-border bg-gov-offWhite p-3 text-sm">
                  {caseData.originalText}
                </pre>
              </div>
            </div>
          </section>

          {/* RIGHT: AI understanding */}
          <div className="space-y-4">
            <section aria-label="AI summary" className="overflow-hidden rounded-gov border border-gov-blue bg-gov-lightBlue">
              <h2 className="bg-gov-blue px-4 py-2 font-extrabold uppercase tracking-wide text-white">
                Summary
              </h2>
              <p className="p-4 text-sm leading-relaxed sm:text-base">{caseData.summary}</p>
            </section>

            <section aria-label="Extracted information" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">🔑 Extracted Information</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="gov-table">
                  <tbody>
                    <tr><th scope="row" className="!w-36">Deadline</th><td className="font-bold">{caseData.deadline ?? "—"}</td></tr>
                    <tr><th scope="row">Amount</th><td className="font-bold">{caseData.amount ?? "—"}</td></tr>
                    {caseData.referenceNumber && <tr><th scope="row">Reference</th><td className="font-mono">{caseData.referenceNumber}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="Required documents" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">🧾 Required Documents</h2>
              {caseData.requiredDocuments.length === 0 ? (
                <p className="mt-2 text-sm">None verified from official information.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {caseData.requiredDocuments.map((d) => (
                    <li key={d} className="flex items-start gap-2 rounded-gov bg-gov-offWhite p-2 text-sm">
                      <input type="checkbox" aria-label={d} className="mt-1 h-5 w-5 accent-[#2E8B57]" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Required actions" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">✅ Required Actions</h2>
              {caseData.requiredActions.length === 0 && caseData.checklist.length === 0 ? (
                <p className="mt-2 text-sm">No action steps recorded.</p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {(caseData.checklist.length ? caseData.checklist.map((c) => c.label + (c.detail ? ` — ${c.detail}` : "")) : caseData.requiredActions).map((label, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gov-green text-xs font-extrabold text-white">{i + 1}</span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-label="Verification signals" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">⚠ Verification Signals</h2>
              {caseData.warningSignals.length === 0 ? (
                <p className="mt-2">
                  <StatusBadge status="verified" label="✓ Grounded in official sources" />
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {caseData.warningSignals.map((w) => (
                    <li key={w} className="rounded-gov bg-amber-50 p-2 text-sm font-semibold text-amber-900">⚠ {w}</li>
                  ))}
                </ul>
              )}
            </section>

            {caseData.qa.length > 0 && (
              <section aria-label="Citizen questions" className="gov-card p-4">
                <h2 className="gov-section-title !text-base">💬 Citizen Questions</h2>
                <div className="mt-2 space-y-2">
                  {caseData.qa.map((entry, i) => (
                    <div key={i} className="rounded-gov bg-gov-offWhite p-2.5 text-sm">
                      <p><strong>Q:</strong> {entry.q}</p>
                      <p className="mt-0.5"><strong>A:</strong> {entry.a.slice(0, 300)}{entry.a.length > 300 ? "…" : ""}</p>
                      <p className="mt-0.5 text-xs text-gov-muted">{entry.grounded ? "✓ Grounded" : "⚠ Unverified"}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Official sources" className="overflow-hidden rounded-gov border-2 border-gov-green">
              <h2 className="bg-gov-green px-4 py-2 font-extrabold uppercase tracking-wide text-white">
                🏛 Official Sources
              </h2>
              <ul className="space-y-2 bg-gov-lightGreen p-4">
                {caseData.sourceIds.map((sid) => (
                  <li key={sid} className="rounded-gov border border-gov-green bg-white p-3 text-sm">
                    <p className="font-mono text-xs font-bold">source id: {sid}</p>
                  </li>
                ))}
                {caseData.sourceIds.length === 0 && (
                  <li className="text-sm">No official sources matched.</li>
                )}
              </ul>
              {caseData.evidence.length > 0 && (
                <div className="space-y-2 bg-gov-lightGreen p-4 pt-0">
                  {caseData.evidence.map((e) => (
                    <details key={e.chunkId} className="rounded-gov border border-gov-green bg-white p-3">
                      <summary className="cursor-pointer text-sm font-bold">
                        Retrieved passage — {e.sourceMetadata.title}
                      </summary>
                      <p className="mt-1 text-sm">{e.content}</p>
                      <p className="mt-1 text-xs text-gov-muted">
                        {e.sourceMetadata.department} · {e.sourceMetadata.state} · verified {e.sourceMetadata.lastVerified}
                      </p>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div>
          <Link href="/caseworker" className="gov-btn-outline">← Back to Case Register</Link>
        </div>
      </div>
    </main>
  );
}
