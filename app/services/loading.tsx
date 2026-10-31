/** Loading state for the services directory route. */
export default function ServicesLoading() {
  return (
    <main id="main-content">
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-blue p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Citizen Services</h1>
          <p className="mt-1 text-sm text-gov-muted" role="status">
            Loading services…
          </p>
        </div>
      </div>
    </main>
  );
}
