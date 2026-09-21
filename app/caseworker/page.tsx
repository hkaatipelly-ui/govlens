import Link from "next/link";
import { getCaseStore, storageKind } from "@/app/lib/case-management";
import Breadcrumb from "@/app/components/Breadcrumb";
import StatusBadge from "@/app/components/StatusBadge";

export const dynamic = "force-dynamic";

export default function CaseworkerPage() {
  const cases = getCaseStore().list();
  const open = cases.filter((c) => c.status === "new").length;
  const review = cases.filter((c) => c.status === "in_review").length;
  const done = cases.filter((c) => c.status === "resolved").length;

  const stats = [
    { label: "Open Cases", value: open, color: "border-t-gov-blue", text: "text-gov-blue" },
    { label: "Pending Review", value: review, color: "border-t-gov-saffron", text: "text-gov-saffronDark" },
    { label: "Completed", value: done, color: "border-t-gov-green", text: "text-gov-greenDark" },
  ];

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Caseworker" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-navy p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
                🏛 Caseworker Dashboard
              </h1>
              <p className="mt-0.5 text-sm text-gov-muted">
                Cases received from citizen phones · Register: {storageKind()} · Total {cases.length}
              </p>
            </div>
            <Link href="/" className="gov-btn-outline !min-h-[44px] !text-sm">← Citizen View</Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Case statistics">
            {stats.map((s) => (
              <div key={s.label} className={`gov-card border-t-4 p-3 text-center sm:p-4 ${s.color}`}>
                <p className={`text-2xl font-extrabold sm:text-4xl ${s.text}`}>{s.value}</p>
                <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gov-muted sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="gov-card overflow-hidden">
          <div className="border-b border-gov-border bg-gov-offWhite px-4 py-2.5">
            <h2 className="font-extrabold text-gov-navy">📥 Incoming Case Register</h2>
          </div>
          {cases.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-lg font-extrabold text-gov-navy">Register is empty</p>
              <p className="mt-1 text-sm text-gov-muted">
                Cases created on the citizen phone (Scan → Result → Create Case) will appear here.
              </p>
              <Link href="/scan" className="gov-btn-primary mt-3">Go to Scan</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="gov-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Case No</th>
                    <th scope="col">Document</th>
                    <th scope="col">Received</th>
                    <th scope="col">Sources</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c, i) => (
                    <tr key={c.id}>
                      <td className="font-mono text-xs">GOV-{String(cases.length - i).padStart(4, "0")}</td>
                      <td>
                        <span className="font-bold text-gov-navy">{c.analysis.documentType}</span>
                        <br />
                        <span className="text-xs text-gov-muted">
                          {c.analysis.extractedFields.applicationId ?? c.id.slice(0, 8)} ·{" "}
                          {c.language === "te" ? "తెలుగు" : c.language === "hi" ? "हिन्दी" : "English"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-sm">
                        {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="text-sm">{c.evidence.length} official</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        <Link
                          href={`/caseworker/${c.id}`}
                          className="inline-block min-h-[40px] rounded-gov bg-gov-blue px-3 py-1.5 text-sm font-bold text-white hover:bg-gov-blueDark"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
