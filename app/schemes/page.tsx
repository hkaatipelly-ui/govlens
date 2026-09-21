import Link from "next/link";
import Breadcrumb from "../components/Breadcrumb";
import StatusBadge from "../components/StatusBadge";
import incomeDoc from "../data/documents/telangana/meeseva-income-certificate.json";
import rationDoc from "../data/documents/telangana/food-security-ration-card.json";
import dharaniDoc from "../data/documents/telangana/dharani-land-passbook.json";
import aadhaarDoc from "../data/documents/government-of-india/aadhaar-update.json";
import pmkisanDoc from "../data/documents/government-of-india/pmkisan.json";
import type { GovernmentDocument } from "../types/government-source";

const DOCS = [incomeDoc, rationDoc, dharaniDoc, aadhaarDoc, pmkisanDoc] as GovernmentDocument[];

export default function SchemesPage() {
  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Schemes" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-green p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
            Schemes & Procedures
          </h1>
          <p className="mt-1 text-sm text-gov-muted">
            Official procedures stored in GovLens. The AI answers only from these documents —
            scan your paper to get scheme-specific guidance.
          </p>
        </div>
        {DOCS.map((d) => (
          <article key={d.id} className="gov-card overflow-hidden">
            <div className="border-b border-gov-border bg-gov-offWhite px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-extrabold text-gov-navy">{d.title}</h2>
                <StatusBadge status="verified" label="Official" />
              </div>
              <p className="mt-0.5 text-xs text-gov-muted">
                {d.department} · {d.state} · Last verified {d.lastVerified}
              </p>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed">{d.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/scan" className="gov-btn-primary !min-h-[44px] !text-sm">
                  📷 Check my document for this
                </Link>
              </div>
              <p className="mt-2 font-mono text-[11px] text-gov-muted">source id: {d.id}</p>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
