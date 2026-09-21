import Link from "next/link";

export default function GovFooter() {
  return (
    <footer className="mt-10 bg-gov-navy text-white">
      <div className="h-1 bg-gov-saffron" aria-hidden />
      <div className="gov-container grid gap-6 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="text-lg font-extrabold tracking-wide">
            GOVLENS <span className="text-gov-saffron">|</span>{" "}
            <span className="font-semibold">గోవ్‌లెన్స్</span>
          </p>
          <p className="mt-2 text-white/80">
            A citizen government-service platform powered by local AI. All document
            processing happens on this device — nothing is sent to the cloud.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="font-bold text-gov-saffron">Citizen Services</p>
          <ul className="mt-2 space-y-1.5">
            <li><Link className="hover:underline" href="/scan">Scan a Document</Link></li>
            <li><Link className="hover:underline" href="/services">Services</Link></li>
            <li><Link className="hover:underline" href="/schemes">Schemes</Link></li>
            <li><Link className="hover:underline" href="/documents">My Documents</Link></li>
            <li><Link className="hover:underline" href="/help">Help &amp; FAQs</Link></li>
          </ul>
        </nav>
        <div>
          <p className="font-bold text-gov-saffron">Official Notice</p>
          <p className="mt-2 text-white/80">
            GovLens explains documents in simple language but is not a substitute for
            official advice. Always verify deadlines, fees and eligibility at the
            concerned department counter or portal before acting.
          </p>
          <p className="mt-3 text-xs text-white/60">
            Prototype for demonstration · Local AI (Ollama + Gemma 3 4B) · English · తెలుగు · हिन्दी
          </p>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="gov-container flex flex-wrap gap-x-4 gap-y-1 py-3 text-xs text-white/70">
          <span>© 2026 GovLens Citizen Services</span>
          <Link href="/about" className="hover:underline">About</Link>
          <Link href="/help" className="hover:underline">Accessibility</Link>
          <Link href="/caseworker" className="hover:underline">Caseworker Portal</Link>
        </div>
      </div>
    </footer>
  );
}
