"use client";

/** Error boundary for the services directory route. */
export default function ServicesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content">
      <div className="gov-container mt-2 pb-6">
        <div className="gov-card border-t-4 border-t-gov-red p-6 text-center" role="alert">
          <p className="text-lg font-extrabold text-gov-navy">Service directory unavailable</p>
          <p className="mt-1 text-sm text-gov-muted">
            The service records could not be loaded right now. Please try again.
          </p>
          <button type="button" onClick={reset} className="gov-btn-primary mt-3">
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
