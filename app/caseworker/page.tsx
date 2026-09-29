"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Breadcrumb from "@/app/components/Breadcrumb";
import StatusBadge from "@/app/components/StatusBadge";
import {
  apiCaseworkerLogin,
  apiCaseworkerStatus,
  apiListAllCases,
  type Case,
} from "@/app/services/api";

export default function CaseworkerPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cases, setCases] = useState<Case[] | null>(null);
  const [code, setCode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiCaseworkerStatus()
      .then((r) => {
        setAuthed(r.authenticated);
        if (r.authenticated) {
          apiListAllCases()
            .then((c) => setCases(c.cases))
            .catch(() => setCases([]));
        }
      })
      .catch(() => setAuthed(false));
  }, []);

  const login = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setLoginError(null);
    try {
      await apiCaseworkerLogin(code.trim());
      setAuthed(true);
      const c = await apiListAllCases();
      setCases(c.cases);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Caseworker" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        {authed === null && (
          <div className="gov-card p-6 text-center"><p>Checking access…</p></div>
        )}

        {authed === false && (
          <div className="gov-card border-t-4 border-t-gov-navy p-4 sm:p-6">
            <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
              🔒 Caseworker Access
            </h1>
            <p className="mt-1 text-sm text-gov-muted">
              This area is restricted. Enter the caseworker access code to view all cases.
              Citizens can track their own documents under <Link href="/documents" className="font-bold text-gov-blue hover:underline">Documents</Link>.
            </p>
            {loginError && (
              <p role="alert" className="mt-3 rounded-gov border border-gov-red bg-red-50 p-3 text-sm font-semibold text-gov-red">
                {loginError}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") login();
                }}
                placeholder="Access code"
                aria-label="Caseworker access code"
                autoComplete="off"
                className="gov-input sm:max-w-xs"
              />
              <button type="button" onClick={login} disabled={busy || !code.trim()} className="gov-btn-primary sm:w-auto">
                {busy ? "Verifying…" : "Unlock register →"}
              </button>
            </div>
          </div>
        )}

        {authed === true && <Register cases={cases} />}
      </div>
    </main>
  );
}

function Register({ cases }: { cases: Case[] | null }) {
  const list = cases ?? [];
  const open = list.filter((c) => c.status === "open").length;
  const review = list.filter((c) => c.status === "needs_review").length;
  const done = list.filter((c) => c.status === "completed").length;

  const stats = [
    { label: "Open Cases", value: open, color: "border-t-gov-blue", text: "text-gov-blue" },
    { label: "Pending Review", value: review, color: "border-t-gov-saffron", text: "text-gov-saffronDark" },
    { label: "Completed", value: done, color: "border-t-gov-green", text: "text-gov-greenDark" },
  ];

  return (
    <>
      <div className="gov-card border-t-4 border-t-gov-navy p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">
              🏛 Caseworker Dashboard
            </h1>
            <p className="mt-0.5 text-sm text-gov-muted">
              Cases received from citizen phones · Total {list.length}
            </p>
          </div>
          <Link href="/" className="gov-btn-outline !min-h-[44px] !text-sm">← Citizen View</Link>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Case statistics">
          {stats.map((s) => (
            <div key={s.label} className={`gov-card border-t-4 p-3 text-center sm:p-4 ${s.color}`}>
              <p className={`text-2xl font-extrabold sm:text-4xl ${s.text}`}>{s.value}</p>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gov-muted sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="gov-card overflow-hidden">
        <div className="border-b border-gov-border bg-gov-offWhite px-4 py-2.5">
          <h2 className="font-extrabold text-gov-navy">📥 Incoming Case Register</h2>
        </div>
        {cases === null ? (
          <div className="p-6 text-center"><p>Loading register…</p></div>
        ) : list.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-lg font-extrabold text-gov-navy">Register is empty</p>
            <p className="mt-1 text-sm text-gov-muted">
              Cases created on the citizen phone (Scan → Result → Create Case) will appear here.
            </p>
            <Link href="/scan" className="gov-btn-primary mt-3">Go to Scan</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="gov-table min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">Case No</th>
                  <th scope="col">Document</th>
                  <th scope="col">Received</th>
                  <th scope="col">Deadline</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c, i) => (
                  <tr key={c.id}>
                    <td className="font-mono text-xs">GOV-{String(list.length - i).padStart(4, "0")}</td>
                    <td>
                      <span className="font-bold text-gov-navy">{c.title}</span>
                      <br />
                      <span className="text-xs text-gov-muted">
                        {c.referenceNumber ?? c.id.slice(0, 8)} ·{" "}
                        {c.language === "te" ? "తెలుగు" : c.language === "hi" ? "हिन्दी" : "English"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="text-sm font-semibold">{c.deadline ?? "—"}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      <Link
                        href={`/caseworker/${c.id}`}
                        className="inline-block min-h-[40px] rounded-gov bg-gov-blue px-3 py-1.5 text-sm font-bold text-white hover:bg-gov-blueDark"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
