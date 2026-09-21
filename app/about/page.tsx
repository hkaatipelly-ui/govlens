import Breadcrumb from "../components/Breadcrumb";

export default function AboutPage() {
  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "About" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-saffron p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">About GovLens</h1>
          <p className="mt-2 text-sm leading-relaxed sm:text-base">
            GovLens is a <strong>citizen government-service platform powered by AI</strong>.
            It helps people understand official notices, forms, certificates and receipts
            in simple English, Telugu and Hindi — and guides them to the correct counter
            with the correct documents.
          </p>
        </div>

        <section aria-labelledby="local-first" className="gov-card p-4">
          <h2 id="local-first" className="gov-section-title !text-base">🔒 Local-First & Private</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>Document reading (OCR) happens in your browser.</li>
            <li>AI analysis runs on local Ollama with Gemma 3 4B — no cloud calls.</li>
            <li>Official information is retrieved from documents stored on this device.</li>
            <li>Cases stay in the on-device database for the caseworker portal.</li>
          </ul>
        </section>

        <section aria-labelledby="verification" className="gov-card p-4">
          <h2 id="verification" className="gov-section-title !text-base">✅ Grounded Answers Only</h2>
          <p className="mt-2 text-sm">
            The AI may only use the official evidence retrieved for your document. It must
            never invent deadlines, fees, eligibility, required documents or procedures.
            When evidence is missing it replies: <em>“I could not verify this from the
            official information available to GovLens.”</em> Every answer carries its
            source IDs and a Grounded / Unverified badge.
          </p>
        </section>

        <section aria-labelledby="tech" className="gov-card p-4">
          <h2 id="tech" className="gov-section-title !text-base">🛠 Technology</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="gov-table">
              <tbody>
                <tr><th scope="row" className="!w-40">App</th><td>Next.js + TypeScript + Tailwind CSS</td></tr>
                <tr><th scope="row">AI</th><td>Ollama (localhost:11434) · Gemma 3 4B via AIEngine abstraction</td></tr>
                <tr><th scope="row">Reading</th><td>Tesseract.js OCR (English + Telugu)</td></tr>
                <tr><th scope="row">Knowledge</th><td>Local JSON corpus + terminology aliases (Telangana & Govt. of India)</td></tr>
                <tr><th scope="row">Voice</th><td>Web Speech recognition & synthesis (en-IN, te-IN, hi-IN)</td></tr>
                <tr><th scope="row">Storage</th><td>On-device SQLite case database</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
