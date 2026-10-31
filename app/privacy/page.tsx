import Breadcrumb from "../components/Breadcrumb";

export default function PrivacyPage() {
  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Privacy" }]} />
      <div className="gov-container mt-2 space-y-4 pb-4">
        <div className="gov-card border-t-4 border-t-gov-blue p-4 sm:p-6">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Privacy Policy</h1>
          <p className="mt-1 text-sm text-gov-muted">
            Last updated: 31 October 2026. This policy explains how GovLens uses your account
            information, uploaded documents, analysis data, and cloud AI services.
          </p>
        </div>

        <section aria-labelledby="how-it-works" className="gov-card p-4">
          <h2 id="how-it-works" className="gov-section-title">1. Google account and sign-in</h2>
          <p className="mt-2 text-sm text-gov-muted">
            GovLens uses Google OAuth (Auth.js/NextAuth) to identify signed-in accounts. When you
            use “Continue with Google”, GovLens may receive basic profile information such as:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gov-muted">
            <li>Name shown by Google.</li>
            <li>Verified email address.</li>
            <li>Profile information Google provides for the selected OAuth scopes.</li>
          </ul>
          <p className="mt-2 text-sm text-gov-muted">
            This information is used to authenticate your session and create a stable internal user
            identifier for data isolation. GovLens does not ask for Gmail, Drive, Calendar or other
            sensitive scopes.
          </p>
        </section>

        <section aria-labelledby="documents" className="gov-card p-4">
          <h2 id="documents" className="gov-section-title">2. Documents, OCR and extracted text</h2>
          <p className="mt-2 text-sm text-gov-muted">
            You may upload government documents such as PDF, DOCX, JPEG/JPG and PNG files, or capture
            a photo. GovLens extracts text from those files and may perform OCR (for example
            English and Telugu) locally in the browser. Extracted text and document structure are
            used to identify, summarise, and verify information.
          </p>
        </section>

        <section aria-labelledby="gemini" className="gov-card p-4">
          <h2 id="gemini" className="gov-section-title">3. Cloud AI with explicit consent</h2>
          <p className="mt-2 text-sm text-gov-muted">
            Document content may be transmitted to Google Gemini Cloud AI after you explicitly
            consent and only when existing privacy and sensitivity checks pass. If consent is not
            given, document content is not sent to Gemini. Gemini is used to help Government analysis;
            its output is not treated as an official government decision.
          </p>
        </section>

        <section aria-labelledby="storage" className="gov-card p-4">
          <h2 id="storage" className="gov-section-title">4. What information is stored</h2>
          <p className="mt-2 text-sm text-gov-muted">
            GovLens stores account-related identifiers, uploaded document text and metadata, OCR
            output, document analysis records, verification results, follow-up data, and grievance
            information required to provide the service. Some operational logs and diagnostics may
            remain on the server or provider logs. GovLens does not avoid storage; records may be retained in the deployment database unless deleted. Do not upload confidential or legally privileged
            documents unless you are authorised to do so.
          </p>
        </section>

        <section aria-labelledby="retention" className="gov-card p-4">
          <h2 id="retention" className="gov-section-title">5. Retention and deletion</h2>
          <p className="mt-2 text-sm text-gov-muted">
            Records may remain in the GovLens deployment until an authorised control deletes them or
            your account/data goes out of retention policy. There is no automatic deletion for every
            record in the current implementation. If you want account-level deletion or a specific
            personal data request, email the contact below and we will handle it according to this
            policy.
          </p>
        </section>

        <section aria-labelledby="security" className="gov-card p-4">
          <h2 id="security" className="gov-section-title">6. Security and isolation</h2>
          <p className="mt-2 text-sm text-gov-muted">
            GovLens uses server-side authentication, HttpOnly session cookies, stable internal
            identifiers, and server-enforced access controls. Each signed-in Google account can see
            its own services; users cannot generally read other users’ uploaded documents, analysis
            results, or grievance histories. Owner/caseworker roles remain restricted separately.
          </p>
        </section>

        <section aria-labelledby="third-party" className="gov-card p-4">
          <h2 id="third-party" className="gov-section-title">7. Third-party services</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gov-muted">
            <li>Google (OAuth sign-in and Google Gemini Cloud AI).</li>
            <li>Hosting/runtime infrastructure and deployment logs (Vercel or equivalent).</li>
            <li>Local OCR / browser models used to read uploaded images and PDFs.</li>
          </ul>
          <p className="mt-2 text-sm text-gov-muted">
            GovLens includes external links to government departments and public portals. Those
            portals have their own privacy policies. We do not silently forward account data to them.
          </p>
        </section>

        <section aria-labelledby="contact" className="gov-card p-4">
          <h2 id="contact" className="gov-section-title">8. Contact and data requests</h2>
          <p className="mt-2 text-sm text-gov-muted">
            Email: <strong>GOVLENS_SUPPORT_EMAIL</strong>
            <br />
            <span className="text-xs">Placeholder. Publish a real support address before launch.</span>
          </p>
          <p className="mt-2 text-sm text-gov-muted">
            Use this address for privacy questions, data access, correction or deletion requests.
          </p>
        </section>
      </div>
    </main>
  );
}
