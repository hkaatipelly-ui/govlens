"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import Breadcrumb from "@/app/components/Breadcrumb";
import { apiAuthStatus } from "@/app/services/api";

/**
 * Public sign-in page backed by the Auth.js session (/api/auth/session).
 * Any unauthenticated visitor can start Google sign-in; OWNER_ACCESS_CODE is
 * never required and the legacy owner-code configuration is not consulted.
 * Ordinary verified Google users sign in as "user"; the deployment owner
 * (OWNER_GOOGLE_EMAIL) additionally sees the owner dashboard link.
 */

function safeCallbackUrl(raw: string | null): string {
  // Same-site path only: block //host, backslashes, and protocol-relative URLs.
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return raw;
  }
  return "/scan";
}

function friendlySignInError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/configuration|invalid.?client/i.test(raw)) {
    return "Google sign-in is misconfigured on the server. Check AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and AUTH_SECRET.";
  }
  if (/redirect/i.test(raw)) {
    return "Google rejected the sign-in redirect. Check the OAuth redirect URI settings.";
  }
  if (/verification|verify/i.test(raw)) {
    return "Your Google email could not be verified. Use an account with a verified email.";
  }
  if (/callback|state/i.test(raw)) {
    return "The Google sign-in callback failed. Please try again.";
  }
  return "Google sign-in failed. Please try again.";
}

export default function OwnerPage() {
  const [status, setStatus] = useState<{ authenticated: boolean; role: "user" | "owner" | null } | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("/scan");

  useEffect(() => {
    apiAuthStatus()
      .then(setStatus)
      .catch(() => setStatus({ authenticated: false, role: null }));
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("callbackUrl") ?? params.get("next");
    if (requested) setCallbackUrl(safeCallbackUrl(requested));
    const authError = params.get("error");
    if (authError) {
      setError(
        authError === "Configuration"
          ? "Google sign-in is misconfigured on the server (OAuth client or AUTH_SECRET missing)."
          : `Google sign-in failed (${authError.replace(/[^A-Za-z_]/g, "")}). Please try again.`
      );
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setError(null);
    try {
      const res = await signIn("google", { callbackUrl, redirect: false });
      if (res?.error) {
        setError(friendlySignInError(res.error));
        setAuthBusy(false);
        return;
      }
      if (res?.url) {
        // Redirect URL returned by the Auth.js callback (path-only inputs).
        window.location.href = res.url;
        return;
      }
      setStatus(await apiAuthStatus());
      setAuthBusy(false);
    } catch (err) {
      setError(friendlySignInError(err));
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/owner" });
    setStatus({ authenticated: false, role: null });
  };

  const isSignedIn = status?.authenticated === true;
  const role = status?.role ?? null;

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Owner" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-navy p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Sign in to GovLens</h1>
          <p className="mt-1 text-sm text-gov-muted">
            Continue with your Google account to scan, understand and track your government
            documents.
          </p>
        </div>

        {status === null ? (
          <div className="gov-card p-6 text-center">
            <p className="text-sm text-gov-muted">Checking session status…</p>
          </div>
        ) : isSignedIn ? (
          <div className="gov-card p-6 space-y-3">
            <p className="font-extrabold text-gov-greenDark">Signed in successfully</p>
            {role === "owner" ? (
              <p className="text-sm text-gov-muted">
                You are signed in as the deployment owner. Owner dashboard controls are available.
              </p>
            ) : (
              <p className="text-sm text-gov-muted">
                You are signed in as a standard user. You can scan and analyse your own documents;
                owner administration is not available.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Link href="/scan" className="gov-btn-primary">
                Go to Document Scanner
              </Link>
              {role === "owner" && (
                <Link href="/owner/dashboard" className="gov-btn-outline">
                  Owner dashboard
                </Link>
              )}
              <button type="button" onClick={() => void handleSignOut()} className="gov-btn-outline">
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="gov-card max-w-md p-6 space-y-4">
            <h2 className="font-extrabold text-gov-navy">Continue with Google</h2>
            <p className="text-sm text-gov-muted">
              Any verified Google account can sign in. Your documents stay visible only to your
              account.
            </p>
            {error ? (
              <p role="alert" className="text-sm font-bold text-gov-red">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={authBusy}
              className="gov-btn-primary flex w-full items-center justify-center gap-2"
            >
              <span
                aria-hidden
                className="rounded bg-white px-1.5 py-0.5 text-xs font-extrabold text-blue-600"
              >
                G
              </span>
              {authBusy ? "Redirecting…" : "Continue with Google"}
            </button>
            <p className="text-xs text-gov-muted">
              The project owner account is configured server-side (OWNER_GOOGLE_EMAIL); no access
              code is needed here.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
