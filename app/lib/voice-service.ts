"use client";

export type VoiceLang = "en" | "te" | "hi";

export const VOICE_LOCALES: Record<VoiceLang, string> = {
  en: "en-IN",
  te: "te-IN",
  hi: "hi-IN",
};

export interface VoiceService {
  isRecognitionSupported(): boolean;
  isSynthesisSupported(): boolean;
  listen(lang: VoiceLang, onResult: (text: string) => void, onError?: (msg: string) => void): () => void;
  speak(text: string, lang: VoiceLang): void;
  stopSpeaking(): void;
}

class BrowserVoiceService implements VoiceService {
  isRecognitionSupported(): boolean {
    if (typeof window === "undefined") return false;
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  isSynthesisSupported(): boolean {
    if (typeof window === "undefined") return false;
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  listen(
    lang: VoiceLang,
    onResult: (text: string) => void,
    onError?: (msg: string) => void
  ): () => void {
    const w = window as unknown as {
      SpeechRecognition?: new () => WebSpeechRecognizer;
      webkitSpeechRecognition?: new () => WebSpeechRecognizer;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      onError?.("Voice input is not supported in this browser. Please type instead.");
      return () => {};
    }
    const rec = new Ctor();
    rec.lang = VOICE_LOCALES[lang];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) onResult(transcript);
    };
    rec.onerror = (e: { error?: string }) => onError?.(e?.error ?? "Voice input failed.");
    try {
      rec.start();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Voice input failed.");
    }
    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }

  speak(text: string, lang: VoiceLang): void {
    if (!this.isSynthesisSupported()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = VOICE_LOCALES[lang];
    const voices = window.speechSynthesis.getVoices();
    const want = VOICE_LOCALES[lang].toLowerCase();
    const match =
      voices.find((v) => v.lang?.toLowerCase() === want) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith(want.split("-")[0])) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith("en"));
    if (match) utter.voice = match;
    window.speechSynthesis.speak(utter);
  }

  stopSpeaking(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

interface WebSpeechRecognizer {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

let singleton: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!singleton) singleton = new BrowserVoiceService();
  return singleton;
}
