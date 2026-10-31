"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import Breadcrumb from "@/app/components/Breadcrumb";
import { apiHealth, apiOwnerStatus, apiOwnerLogout } from "@/app/services/api";

export default function OwnerPage() {
  const [status, setStatus] = useState<{ authenticated: boolean; configured: boolean } | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof apiHealth>> | null>(null);

  const refresh = () => {
    apiOwnerStatus()
      .then(setStatus)
      .catch(() => setStatus({ authenticated: false, configured: false }));
  };

  useEffect(() => {
    refresh();
    apiHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/scan" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await apiOwnerLogout();
    } finally {
      await signOut({ callbackUrl: "/owner" });
      refresh();
    }
  };

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Owner" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-navy p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Sign in to GovLens</h1>
          <p className="mt-1 text-sm text-gov-muted">
            Continue with your Google account to access document assistance and public services.
          </p>
        </div>

        {status === null ? (
          <div className="gov-card p-6 text-center">
            <p className="text-sm text-gov-muted">Checking sign-in status...</p>
          </div>
        ) : status.authenticated ? (
          <>
            <div className="gov-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gov-green text-white font-extrabold">✓</div>
                <div>
                  <p className="font-extrabold text-gov-greenDark">Signed in as project owner</p>
                  <p className="text-sm text-gov-muted">Document analysis, document Q&A and explanation are unlocked.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/scan" className="gov-btn-primary">Go to Scan</Link>
                <button type="button" onClick={() => void handleSignOut()} className="gov-btn-outline">
                  Sign out
                </button>
              </div>
            </div>

            <div className="gov-card p-6">
              <h2 className="font-extrabold text-gov-navy">Google Gemini status</h2>
              <p className="mt-2 text-sm text-gov-muted">
                {health?.gemini?.detail ?? "Status unavailable."}
              </p>
            </div>
          </>
        ) : (
          <div className="gov-card max-w-md p-6 space-y-4">
            <h2 className="font-extrabold text-gov-navy">Continue with Google</h2>
            <p className="text-sm text-gov-muted">
              Only the configured project owner Google account is authorized.
            </p>
            {error ? (
              <p role="alert" className="text-sm font-bold text-gov-red">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={authBusy}
              className="gov-btn-primary w-full flex items-center justify-center gap-2"
            >
              <span aria-hidden className="rounded bg-white px-1.5 py-0.5 text-xs font-extrabold text-blue-600">G</span>
              {authBusy ? "Redirecting..." : "Continue with Google"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
