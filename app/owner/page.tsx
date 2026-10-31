"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Breadcrumb from "@/app/components/Breadcrumb";
import {
  apiHealth,
  apiOwnerLogin,
  apiOwnerLogout,
  apiOwnerStatus,
} from "@/app/services/api";

/**
 * Minimal owner sign-in (additive page — no existing page was changed).
 * Signing in sets the server-side owner session cookie that guards the
 * owner-controlled local AI (Ollama/Gemma): document analysis, document Q&A
 * and translation.
 */
export default function OwnerPage() {
  const [status, setStatus] = useState<{ authenticated: boolean; configured: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const login = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiOwnerLogin(code.trim());
      setCode("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await apiOwnerLogout();
    } finally {
      refresh();
    }
  };

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Owner" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-navy p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Owner Sign-In</h1>
          <p className="mt-1 text-sm text-gov-muted">
            The local AI (Ollama / Gemma 3 4B) is reserved for the authenticated project owner.
            Sign in to scan and analyse documents on your own machine. Public visitors only get
            the hosted public-service Q&A when it is enabled.
          </p>
        </div>

        {status === null ? (
          <div className="gov-card p-6 text-center">
            <p className="text-sm text-gov-muted">Checking owner session…</p>
          </div>
        ) : !status.configured ? (
          <div className="gov-card p-6" role="alert">
            <p className="font-extrabold text-gov-red">Owner access is not configured</p>
            <p className="mt-1 text-sm text-gov-muted">
              Set <code>OWNER_ACCESS_CODE</code> (at least 8 characters) in{" "}
              <code>.env.local</code> on the server and restart GovLens. No default code is built
              in — that is deliberate. See <code>.env.example</code>.
            </p>
          </div>
        ) : status.authenticated ? (
          <>
            <div className="gov-card p-6">
              <p className="font-extrabold text-gov-greenDark">✓ Signed in as project owner</p>
              <p className="mt-1 text-sm text-gov-muted">
                Document analysis, document Q&A and translation are unlocked for this browser.
                The session expires automatically.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/scan" className="gov-btn-primary">
                  Go to Scan
                </Link>
                <button type="button" onClick={logout} className="gov-btn-outline">
                  Sign out
                </button>
              </div>
            </div>

            <div className="gov-card p-6">
              <h2 className="font-extrabold text-gov-navy">AI provider status</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="font-bold text-gov-navy">Local AI (owner only)</dt>
                  <dd className="text-gov-muted">
                    {health
                      ? health.ok
                        ? `${health.detail} (model ${health.model})`
                        : health.detail
                      : "Status unavailable."}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-gov-navy">Public Q&amp;A (Gemini)</dt>
                  <dd className="text-gov-muted">
                    {health?.gemini?.detail ?? "Status unavailable."}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-gov-muted">
                These are configuration and last-connection statuses only — no API keys or
                private content are ever shown.
              </p>
            </div>
          </>
        ) : (
          <div className="gov-card max-w-md p-6">
            <h2 className="font-extrabold text-gov-navy">Enter owner code</h2>
            <label htmlFor="owner-code" className="mt-3 block text-sm font-bold text-gov-navy">
              Owner access code
            </label>
            <input
              id="owner-code"
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void login();
              }}
              className="gov-input mt-1 w-full"
              placeholder="••••••••"
            />
            {error ? (
              <p role="alert" className="mt-2 text-sm font-bold text-gov-red">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void login()}
              disabled={busy || !code.trim()}
              className="gov-btn-primary mt-4 w-full"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
