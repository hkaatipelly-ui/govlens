"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PortalLang = "en" | "te" | "hi";

interface PortalPrefs {
  lang: PortalLang;
  setLang: (l: PortalLang) => void;
  fontScale: number;
  biggerText: () => void;
  smallerText: () => void;
  resetText: () => void;
  highContrast: boolean;
  toggleContrast: () => void;
}

const Ctx = createContext<PortalPrefs | null>(null);

const LANG_KEY = "govlens-lang";
const SCALE_KEY = "govlens-font-scale";
const CONTRAST_KEY = "govlens-contrast";

export function PortalProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PortalLang>("en");
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    try {
      const l = localStorage.getItem(LANG_KEY);
      if (l === "en" || l === "te" || l === "hi") setLangState(l);
      const s = parseFloat(localStorage.getItem(SCALE_KEY) ?? "1");
      if (!Number.isNaN(s)) setFontScale(Math.min(1.3, Math.max(0.9, s)));
      setHighContrast(localStorage.getItem(CONTRAST_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--gov-font-scale", String(fontScale));
    try {
      localStorage.setItem(SCALE_KEY, String(fontScale));
    } catch {
      /* noop */
    }
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.classList.toggle("gov-contrast", highContrast);
    try {
      localStorage.setItem(CONTRAST_KEY, highContrast ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [highContrast]);

  const setLang = useCallback((l: PortalLang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* noop */
    }
  }, []);

  const value = useMemo<PortalPrefs>(
    () => ({
      lang,
      setLang,
      fontScale,
      biggerText: () => setFontScale((s) => Math.min(1.3, +(s + 0.1).toFixed(2))),
      smallerText: () => setFontScale((s) => Math.max(0.9, +(s - 0.1).toFixed(2))),
      resetText: () => setFontScale(1),
      highContrast,
      toggleContrast: () => setHighContrast((v) => !v),
    }),
    [lang, setLang, fontScale, highContrast]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortal(): PortalPrefs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortal must be used inside PortalProvider");
  return ctx;
}

/** AI request language: 'hi' requested explicitly, 'te' detected/selected, else 'en'. */
export function aiLangFor(portal: PortalLang): "en" | "te" | "hi" {
  return portal;
}
