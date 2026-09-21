import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseStore } from "@/app/lib/case-management";
import Breadcrumb from "@/app/components/Breadcrumb";
import StatusBadge from "@/app/components/StatusBadge";

export const dynamic = "force-dynamic";

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const caseData = getCaseStore().get(params.id);
  if (!caseData) notFound();

  const f = caseData.analysis.extractedFields;

  return (
    <main id="main-content">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Caseworker", href: "/caseworker" },
          { label: caseData.analysis.documentType },
        ]}
      />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card flex flex-wrap items-center justify-between gap-2 border-t-4 border-t-gov-navy p-4">
          <div>
            <h1 className="text-xl font-extrabold text-gov-navy">
              Case File — {caseData.analysis.documentType}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-gov-muted">ID: {caseData.id}</p>
          </div>
          <StatusBadge status={caseData.status} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* LEFT: original document */}
          <section aria-label="Original document" className="gov-card overflow-hidden">
            <h2 className="border-b border-gov-border bg-gov-offWhite px-4 py-2.5 font-extrabold text-gov-navy">
              📄 Original Document
            </h2>
            <div className="space-y-3 p-4">
              <div className="overflow-x-auto">
                <table className="gov-table">
                  <tbody>
                    <tr><th scope="row" className="!w-36">Received</th><td>{new Date(caseData.createdAt).toLocaleString("en-IN")}</td></tr>
                    <tr><th scope="row">Language</th><td>{caseData.language === "te" ? "తెలుగు" : caseData.language === "hi" ? "हिन्दी" : "English"}</td></tr>
                    {typeof caseData.ocrConfidence === "number" && (
                      <tr><th scope="row">OCR Confidence</th><td>{Math.round(caseData.ocrConfidence * 100)}%</td></tr>
                    )}
                    {caseData.userNote && <tr><th scope="row">Citizen Note</th><td>{caseData.userNote}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gov-navy">Document text (evidence)</h3>
                <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-gov border border-gov-border bg-gov-offWhite p-3 text-sm">
                  {caseData.documentText}
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
              <p className="p-4 text-sm leading-relaxed sm:text-base">{caseData.analysis.summary}</p>
            </section>

            <section aria-label="Extracted information" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">🔑 Extracted Information</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="gov-table">
                  <tbody>
                    {f.applicantName && <tr><th scope="row" className="!w-36">Applicant</th><td className="font-semibold">{f.applicantName}</td></tr>}
                    {f.applicationId && <tr><th scope="row">Application / ID</th><td className="font-mono">{f.applicationId}</td></tr>}
                    {f.officeOrDepartment && <tr><th scope="row">Office</th><td>{f.officeOrDepartment}</td></tr>}
                    <tr><th scope="row">Dates</th><td>{f.dates.join("; ") || "—"}</td></tr>
                    <tr><th scope="row">Amounts</th><td>{f.amounts.join("; ") || "—"}</td></tr>
                    <tr><th scope="row">Deadlines</th><td className="font-bold">{f.deadlines.join("; ") || "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="Required documents" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">🧾 Required Documents</h2>
              {f.requiredDocuments.length === 0 ? (
                <p className="mt-2 text-sm">None verified from official information.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {f.requiredDocuments.map((d) => (
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
              {caseData.checklist.length === 0 ? (
                <p className="mt-2 text-sm">No action steps recorded.</p>
              ) : (
                <ol className="mt-2 space-y-1.5">
                  {caseData.checklist.map((c, i) => (
                    <li key={c.id} className="flex gap-2 text-sm">
                      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gov-green text-xs font-extrabold text-white">{i + 1}</span>
                      <span><strong>{c.label}</strong>{c.detail ? ` — ${c.detail}` : ""}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-label="Verification signals" className="gov-card p-4">
              <h2 className="gov-section-title !text-base">⚠ Verification Signals</h2>
              <p className="mt-2">
                <StatusBadge
                  status={caseData.analysis.verified ? "verified" : "unverified"}
                  label={caseData.analysis.verified ? "✓ Grounded in official sources" : "⚠ Verification recommended"}
                />
              </p>
              <p className="mt-1 text-sm text-gov-muted">
                {caseData.analysis.verified
                  ? "The AI explanation is backed by the official sources below."
                  : "Parts of this case could not be confirmed. Verify at the department counter before deciding."}
              </p>
            </section>

            <section aria-label="Official sources" className="overflow-hidden rounded-gov border-2 border-gov-green">
              <h2 className="bg-gov-green px-4 py-2 font-extrabold uppercase tracking-wide text-white">
                🏛 Official Sources
              </h2>
              <ul className="space-y-2 bg-gov-lightGreen p-4">
                {caseData.analysis.sources.map((s) => (
                  <li key={s.id} className="rounded-gov border border-gov-green bg-white p-3 text-sm">
                    <p className="font-bold">{s.title}</p>
                    {s.department && <p className="text-xs text-gov-muted">{s.department}</p>}
                    <p className="font-mono text-[11px] text-gov-muted">source id: {s.id}</p>
                  </li>
                ))}
                {caseData.analysis.sources.length === 0 && (
                  <li className="text-sm">No official sources matched.</li>
                )}
              </ul>
              {caseData.evidence.length > 0 && (
                <div className="space-y-2 bg-gov-lightGreen p-4 pt-0">
                  {caseData.evidence.map((e) => (
                    <details key={e.sourceId} className="rounded-gov border border-gov-green bg-white p-3">
                      <summary className="cursor-pointer text-sm font-bold">
                        Retrieved passage — {e.title}
                      </summary>
                      <p className="mt-1 text-sm">{e.text}</p>
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
