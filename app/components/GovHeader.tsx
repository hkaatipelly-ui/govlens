"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortal, type PortalLang } from "./PortalProvider";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/schemes", label: "Schemes" },
  { href: "/documents", label: "Documents" },
  { href: "/help", label: "Help" },
  { href: "/about", label: "About" },
];

const LANGS: Array<{ code: PortalLang; label: string }> = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు" },
  { code: "hi", label: "हिन्दी" },
];

export default function GovHeader() {
  const pathname = usePathname();
  const {
    lang,
    setLang,
    biggerText,
    smallerText,
    resetText,
    highContrast,
    toggleContrast,
  } = usePortal();

  const isCaseworker = pathname.startsWith("/caseworker");

  return (
    <header>
      <a href="#main-content" className="gov-skip-link">
        Skip to main content
      </a>

      {/* Top information bar */}
      <div className="bg-gov-navy text-white">
        <div className="gov-container flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-xs sm:text-sm">
          <p className="font-semibold tracking-wide">
            <span aria-hidden>🏛️ </span>Citizen Services Portal
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div role="group" aria-label="Language / भाषा">
              {LANGS.map((l, i) => (
                <span key={l.code}>
                  {i > 0 && <span aria-hidden className="mx-1 text-white/50">|</span>}
                  <button
                    type="button"
                    onClick={() => setLang(l.code)}
                    aria-pressed={lang === l.code}
                    className={`rounded px-1 py-0.5 font-semibold underline-offset-2 hover:underline ${
                      lang === l.code ? "bg-gov-saffron px-2 text-gov-ink" : "text-white"
                    }`}
                  >
                    {l.label}
                  </button>
                </span>
              ))}
            </div>
            <span aria-hidden className="hidden text-white/40 sm:inline">|</span>
            <div role="group" aria-label="Accessibility options" className="flex items-center gap-1">
              <span className="hidden text-white/80 md:inline">Accessibility</span>
              <button
                type="button"
                onClick={smallerText}
                aria-label="Decrease text size"
                className="min-h-[32px] min-w-[32px] rounded border border-white/40 px-1 font-bold hover:bg-white/10"
              >
                A-
              </button>
              <button
                type="button"
                onClick={resetText}
                aria-label="Reset text size"
                className="min-h-[32px] min-w-[32px] rounded border border-white/40 px-1 font-bold hover:bg-white/10"
              >
                A
              </button>
              <button
                type="button"
                onClick={biggerText}
                aria-label="Increase text size"
                className="min-h-[32px] min-w-[32px] rounded border border-white/40 px-1 font-bold hover:bg-white/10"
              >
                A+
              </button>
              <button
                type="button"
                onClick={toggleContrast}
                aria-pressed={highContrast}
                aria-label="Toggle high contrast"
                title="High contrast"
                className={`min-h-[32px] rounded border border-white/40 px-2 font-bold hover:bg-white/10 ${
                  highContrast ? "bg-white text-gov-navy" : ""
                }`}
              >
                ◐
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="border-b-4 border-gov-saffron bg-white">
        <div className="gov-container flex items-center gap-3 py-3 sm:gap-4">
          {/* Emblem block */}
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-gov bg-gov-navy text-xl font-extrabold text-gov-saffron sm:h-14 sm:w-14 sm:text-2xl"
          >
            GL
          </div>
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-tight tracking-wide text-gov-navy sm:text-2xl">
              GOVLENS
            </p>
            <p className="truncate text-xs text-gov-muted sm:text-sm">
              {isCaseworker ? "Caseworker Portal — Administration" : "Citizen Document Assistance Platform"}
            </p>
          </div>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <span className="gov-badge bg-gov-lightGreen text-gov-greenDark">● Local AI</span>
            <span className="gov-badge bg-gov-lightBlue text-gov-navy">EN · TE · HI</span>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Primary" className="bg-gov-blue">
          <div className="gov-container">
            {isCaseworker ? (
              <ul className="flex gap-1 overflow-x-auto text-sm font-bold text-white sm:text-base">
                {[
                  { href: "/caseworker", label: "Dashboard" },
                  { href: "/caseworker", label: "Cases" },
                  { href: "/documents", label: "Documents" },
                  { href: "/", label: "Citizen View" },
                ].map((item) => (
                  <li key={item.label + item.href}>
                    <Link
                      href={item.href}
                      aria-current={pathname === item.href ? "page" : undefined}
                      className={`block whitespace-nowrap px-3 py-2.5 hover:bg-gov-blueDark sm:px-4 ${
                        pathname === item.href ? "bg-gov-navy underline decoration-gov-saffron decoration-[3px] underline-offset-8" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex gap-1 overflow-x-auto text-sm font-bold text-white sm:text-base">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={pathname === item.href ? "page" : undefined}
                      className={`block whitespace-nowrap px-3 py-2.5 hover:bg-gov-blueDark sm:px-4 ${
                        pathname === item.href ? "bg-gov-navy underline decoration-gov-saffron decoration-[3px] underline-offset-8" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                <li className="ml-auto">
                  <Link
                    href="/caseworker"
                    className="block whitespace-nowrap px-3 py-2.5 text-gov-saffron hover:bg-gov-blueDark sm:px-4"
                  >
                    Caseworker →
                  </Link>
                </li>
              </ul>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
