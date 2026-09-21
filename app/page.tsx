import Link from "next/link";
import Breadcrumb from "./components/Breadcrumb";
import HealthNotice from "./components/HealthNotice";
import { POPULAR_SERVICES, HOW_IT_WORKS } from "./lib/portal-data";

export default function HomePage() {
  return (
    <main id="main-content">
      <HealthNotice />
      <Breadcrumb items={[{ label: "Home" }]} />

      {/* Hero */}
      <section className="gov-container mt-2">
        <div className="overflow-hidden rounded-gov border border-gov-border bg-gov-navy text-white shadow-gov-md">
          <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-5">
            <div className="md:col-span-3">
              <p className="gov-badge bg-gov-saffron text-gov-ink">
                Citizen Document Assistance · పౌర సేవ
              </p>
              <h1 className="mt-3 text-2xl font-extrabold leading-snug sm:text-3xl lg:text-4xl">
                Understand Government Documents in Simple Language
              </h1>
              <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
                GovLens helps citizens understand official notices, forms and
                public-service communications — in English, తెలుగు and हिन्दी —
                using AI that runs locally on this device.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link href="/scan" className="gov-btn-saffron">
                  <span aria-hidden>📷</span> Scan a Document
                </Link>
                <Link href="/scan?mode=upload" className="gov-btn-outline-light">
                  <span aria-hidden>📤</span> Upload Document
                </Link>
                <Link href="/scan?mode=voice" className="gov-btn-outline-light">
                  <span aria-hidden>🎙</span> Ask GovLens
                </Link>
              </div>
            </div>
            <div className="md:col-span-2" aria-label="Service highlights">
              <div className="grid h-full grid-cols-2 gap-2">
                {[
                  ["🔒", "100% Local", "No cloud upload"],
                  ["🗣", "3 Languages", "EN · TE · HI"],
                  ["📑", "Official Sources", "Grounded answers"],
                  ["✅", "Action Checklist", "Next steps"],
                ].map(([icon, title, sub]) => (
                  <div
                    key={title}
                    className="rounded-gov border border-white/20 bg-white/10 p-3"
                  >
                    <p className="text-xl" aria-hidden>{icon}</p>
                    <p className="mt-1 text-sm font-bold">{title}</p>
                    <p className="text-xs text-white/75">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="h-1.5 bg-gov-saffron" aria-hidden />
        </div>
      </section>

      {/* Announcement strip */}
      <section aria-label="Announcements" className="gov-container mt-4">
        <div className="flex items-stretch gap-0 overflow-hidden rounded-gov border border-gov-saffron bg-amber-50 shadow-gov">
          <p className="flex items-center bg-gov-saffron px-3 py-2 text-sm font-extrabold text-gov-ink">
            <span aria-hidden>📢</span>&nbsp;NOTICE
          </p>
          <p className="px-3 py-2 text-sm">
            Always verify deadlines, fees and eligibility at the concerned department
            counter. GovLens explains documents — it does not replace official advice.{" "}
            <Link href="/help" className="font-bold text-gov-blue hover:underline">
              Read how it works →
            </Link>
          </p>
        </div>
      </section>

      {/* Popular services */}
      <section aria-labelledby="popular-services" className="gov-container mt-8">
        <h2 id="popular-services" className="gov-section-title">
          <span aria-hidden>🏛️</span> Popular Services
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {POPULAR_SERVICES.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className={`gov-card group p-4 hover:shadow-gov-md hover:ring-2 hover:ring-gov-blue ${s.color}`}
            >
              <p className="text-2xl" aria-hidden>{s.icon}</p>
              <p className="mt-2 font-bold text-gov-navy group-hover:underline">
                {s.title} <span className="font-semibold text-gov-muted">· {s.titleTe}</span>
              </p>
              <p className="mt-1 text-xs text-gov-muted sm:text-sm">{s.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How GovLens works */}
      <section aria-labelledby="how-it-works" className="gov-container mt-8">
        <h2 id="how-it-works" className="gov-section-title">
          <span aria-hidden>⚙️</span> How GovLens Works
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.step} className="gov-card relative p-4">
              <p
                aria-hidden
                className={`inline-block rounded-gov px-2 py-0.5 text-sm font-extrabold text-white ${
                  i % 2 === 0 ? "bg-gov-blue" : "bg-gov-green"
                }`}
              >
                {s.step}
              </p>
              <p className="mt-2 text-lg font-bold text-gov-navy">
                {s.title} <span className="text-sm font-semibold text-gov-muted">· {s.titleTe}</span>
              </p>
              <p className="mt-1 text-sm text-gov-ink">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 text-center">
          <Link href="/scan" className="gov-btn-primary">
            Start Now — Scan a Document <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* Official information */}
      <section aria-labelledby="official-info" className="gov-container mt-8">
        <h2 id="official-info" className="gov-section-title">
          <span aria-hidden>📚</span> Official Information Base
        </h2>
        <div className="gov-card mt-4 overflow-hidden">
          <div className="border-l-4 border-l-gov-green p-4">
            <p className="font-bold text-gov-navy">
              Answers are grounded in official department information
            </p>
            <p className="mt-1 text-sm">
              GovLens retrieves passages from the Telangana and Government of India
              documents stored on this device — MeeSeva certificates, ration cards,
              Dharani land records, Aadhaar and PM-KISAN procedures — and the AI may
              only use that evidence. When evidence is missing, it says so instead
              of guessing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/schemes" className="gov-btn-outline !min-h-[44px] !text-sm">
                Browse schemes & procedures
              </Link>
              <Link href="/about" className="gov-btn-outline !min-h-[44px] !text-sm">
                How verification works
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
