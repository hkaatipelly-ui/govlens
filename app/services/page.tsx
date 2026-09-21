import Link from "next/link";
import Breadcrumb from "../components/Breadcrumb";
import { POPULAR_SERVICES } from "../lib/portal-data";

export default function ServicesPage() {
  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Services" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-blue p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Citizen Services</h1>
          <p className="mt-1 text-sm text-gov-muted">
            Choose a service. GovLens will read your document and guide you through the
            official procedure step by step.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {POPULAR_SERVICES.map((s) => (
            <Link key={s.id} href={s.href} className={`gov-card p-5 hover:shadow-gov-md hover:ring-2 hover:ring-gov-blue ${s.color}`}>
              <p className="text-3xl" aria-hidden>{s.icon}</p>
              <p className="mt-2 text-lg font-extrabold text-gov-navy">
                {s.title} <span className="text-sm font-semibold text-gov-muted">· {s.titleTe}</span>
              </p>
              <p className="mt-1 text-sm">{s.description}</p>
              <p className="mt-2 text-sm font-bold text-gov-blue">Open service →</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
