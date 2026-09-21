"use client";

import { useState } from "react";
import { getVoiceService, type VoiceLang } from "../lib/voice-service";

interface Props {
  lang: VoiceLang;
  onTranscript: (text: string) => void;
  large?: boolean;
}

export default function VoiceInput({ lang, onTranscript, large = false }: Props) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" && getVoiceService().isRecognitionSupported();

  const toggle = () => {
    if (listening) {
      setListening(false);
      return;
    }
    setError(null);
    setListening(true);
    const stop = getVoiceService().listen(
      lang,
      (text) => {
        setListening(false);
        onTranscript(text);
      },
      (msg) => {
        setListening(false);
        setError(msg);
      }
    );
    setTimeout(() => {
      stop();
      setListening(false);
    }, 12000);
  };

  if (!supported) {
    return (
      <p className="text-xs text-gov-muted">
        Voice input is not supported in this browser — please type your question.
      </p>
    );
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Ask by voice"}
        className={`inline-flex items-center justify-center gap-2 rounded-full font-bold text-white shadow-gov-md focus:outline-none ${
          large ? "h-20 w-20 text-3xl" : "h-14 w-14 text-2xl"
        } ${listening ? "animate-pulse bg-gov-red" : "bg-gov-green hover:bg-gov-greenDark"}`}
      >
        <span aria-hidden>🎙</span>
      </button>
      <p className="mt-1 text-xs font-bold text-gov-navy">
        {listening ? "Listening… tap to stop" : "Tap to speak"}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-gov-red">
          {error}
        </p>
      )}
    </div>
  );
}
