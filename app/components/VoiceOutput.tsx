"use client";

import { useCallback, useEffect, useState } from "react";
import { getVoiceService, type VoiceLang } from "../lib/voice-service";

const LISTEN_LABEL: Record<VoiceLang, string> = {
  en: "🔊 Listen",
  te: "🔊 తెలుగులో వినండి",
  hi: "🔊 हिन्दी में सुनें",
};

/**
 * Listen / Stop control for a single answer. One shared SpeechSynthesis
 * controller: Listen cancels any active speech first (no overlap), Stop
 * cancels immediately, and unmount / language / text changes cancel too.
 */
export default function VoiceOutput({ text, lang }: { text: string; lang: VoiceLang }) {
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    getVoiceService().stopSpeaking();
    setSpeaking(false);
  }, []);

  // Cancel speech when navigating away, or when the language/text changes
  // (prevents overlap and stale audio in either language).
  useEffect(() => {
    getVoiceService().stopSpeaking();
    setSpeaking(false);
    return () => {
      getVoiceService().stopSpeaking();
    };
  }, [lang, text]);

  const listen = useCallback(() => {
    if (!text) return;
    getVoiceService().speakWithEvents(text, lang, {
      onend: () => setSpeaking(false),
      onerror: () => setSpeaking(false),
    });
    setSpeaking(true);
  }, [text, lang]);

  if (!text) return null;
  const supported =
    typeof window !== "undefined" && getVoiceService().isSynthesisSupported();
  if (!supported) return null;

  return (
    <span className="mt-2 inline-flex gap-2">
      <button
        type="button"
        onClick={listen}
        disabled={speaking}
        aria-label="Read answer aloud"
        className="gov-btn-outline !min-h-[44px] !px-3 !py-1.5 !text-sm"
      >
        {LISTEN_LABEL[lang]}
      </button>
      <button
        type="button"
        onClick={stop}
        disabled={!speaking}
        aria-label="Stop reading aloud"
        className="gov-btn-outline !min-h-[44px] !px-3 !py-1.5 !text-sm"
      >
        ■ Stop
      </button>
    </span>
  );
}
