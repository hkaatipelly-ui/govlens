"use client";

import { getVoiceService, type VoiceLang } from "../lib/voice-service";

const LABEL: Record<VoiceLang, string> = {
  en: "🔊 Listen",
  te: "🔊 తెలుగులో వినండి",
  hi: "🔊 हिन्दी में सुनें",
};

export default function VoiceOutput({ text, lang }: { text: string; lang: VoiceLang }) {
  if (!text) return null;
  const supported =
    typeof window !== "undefined" && getVoiceService().isSynthesisSupported();
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => getVoiceService().speak(text, lang)}
      aria-label="Read answer aloud"
      className="gov-btn-outline mt-2 !min-h-[44px] !px-3 !py-1.5 !text-sm"
    >
      {LABEL[lang]}
    </button>
  );
}
