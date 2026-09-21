import Breadcrumb from "../components/Breadcrumb";
import { HELP_FAQS, QA_EXAMPLES } from "../lib/portal-data";

export default function HelpPage() {
  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Help" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-blue p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Help & FAQs</h1>
          <p className="mt-1 text-sm text-gov-muted">
            How to use GovLens — scanning, languages, voice and verification.
          </p>
        </div>

        <section aria-labelledby="faq" className="gov-card p-4">
          <h2 id="faq" className="gov-section-title !text-base">❓ Frequently Asked Questions</h2>
          <div className="mt-3 space-y-2">
            {HELP_FAQS.map((f) => (
              <details key={f.q} className="rounded-gov border border-gov-border bg-gov-offWhite p-3">
                <summary className="cursor-pointer font-bold text-gov-navy">{f.q}</summary>
                <p className="mt-1 text-sm">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="voice-help" className="gov-card p-4">
          <h2 id="voice-help" className="gov-section-title !text-base">🎙 Using Voice</h2>
          <p className="mt-2 text-sm">
            On the result screen, tap the green microphone and ask in English, Telugu or Hindi.
            Try one of these:
          </p>
          <ul className="mt-2 space-y-1">
            {QA_EXAMPLES.map((ex) => (
              <li key={ex} className="rounded-gov bg-gov-lightBlue px-3 py-2 text-sm font-semibold text-gov-navy">
                “{ex}”
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="a11y" className="gov-card p-4">
          <h2 id="a11y" className="gov-section-title !text-base">♿ Accessibility</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>Use A- / A / A+ in the top bar to change text size.</li>
            <li>Use ◐ for high-contrast mode.</li>
            <li>All buttons are keyboard reachable with a visible saffron focus ring.</li>
            <li>Answers can be read aloud in English, Telugu and Hindi.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
