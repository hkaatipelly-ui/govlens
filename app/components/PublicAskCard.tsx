"use client";

import { useState } from "react";
import { usePortal } from "./PortalProvider";
import VoiceInput from "./VoiceInput";
import VoiceOutput from "./VoiceOutput";
import StatusBadge from "./StatusBadge";
import { apiPublicAsk, type PublicAnswerSource } from "../services/api";
import { sourceBadge, sourceReviewLabel } from "../types/service";

type Lang = "en" | "te" | "hi";

function t(key: string, lang: Lang): string {
  const table: Record<string, Record<Lang, string>> = {
    heading: {
      en: "Ask a public-service question",
      te: "ప్రజా సేవా ప్రశ్న అడగండి",
      hi: "सार्वजनिक-सेवा प्रश्न पूछें",
    },
    caption: {
      en: "Answers use only reviewed sources. Nothing private is sent.",
      te: "సమాధానాలు కేవలం సమీక్షించిన మూలాల నుండే. వ్యక్తిగతం ఏమీ పంపబడదు.",
      hi: "जवाब केवल समीक्षित जानकारी से। कुछ निज़ी नहीं भेजा जाता।",
    },
    label: { en: "Question", te: "ప్రశ్న", hi: "प्रश्न" },
    placeholder: {
      en: "e.g. What documents are needed for an income certificate?",
      te: "ఉదా: ఆదాయ ధృవీకరణ పత్రానికి ఏ పత్రాలు కావాలి?",
      hi: "उदा: आय प्रमाणपत्र के लिए कौन-से दस्तावेज़ चाहिए?",
    },
    ask: { en: "Ask", te: "అడగండి", hi: "पूछें" },
    asking: { en: "Asking…", te: "అడుగుతోంది…", hi: "पूछ रहा है…" },
    supported: {
      en: "Supported by reviewed sources",
      te: "సమీక్షించిన మూలాలు అండ",
      hi: "समीक्षित स्रोतों से समर्थित",
    },
    unsupported: {
      en: "Not supported by reviewed sources",
      te: "సమీక్షించిన మూలాలు అండలేవు",
      hi: "समीक्षित स्रोतों से असमर्थित",
    },
    sources: { en: "Sources", te: "మూలాలు", hi: "स्रोत" },
  };
  return table[key]?.[lang] ?? key;
}

const SOURCE_CLASS_LABEL: Record<string, string> = {
  official: "Official",
  secondary_unverified: "Unconfirmed",
  sample: "Sample only",
};

export default function PublicAskCard() {
  const { lang: ctxLang } = usePortal();
  const lang = (ctxLang as Lang) ?? "en";
  const voiceLang = lang as unknown as "en" | "te" | "hi";

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(false);
  const [limitations, setLimitations] = useState<string>("");
  const [sources, setSources] = useState<PublicAnswerSource[]>([]);

  async function submit(value: string) {
    const q = value.trim();
    if (!q || asking) return;
    setAsking(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setLimitations("");
    try {
      const r = await apiPublicAsk(q, voiceLang);
      setAnswer(r.answer);
      setIntent(r.intent);
      setSupported(r.supported);
      setLimitations(r.limitations ?? "");
      setSources(r.sources ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not answer the question.");
      setAnswer(null);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="gov-card" aria-labelledby="public-ask-h">
      <h2 id="public-ask-h" className="text-lg font-bold text-gov-navy mb-1">
        {t("heading", lang)}
      </h2>
      <p className="text-sm text-gov-textSecondary mb-3 gov-lead">{t("caption", lang)}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="space-y-2"
      >
        <label htmlFor="public-question" className="sr-only">
          {t("label", lang)}
        </label>
        <textarea
          id="public-question"
          className="w-full border rounded p-2 text-sm min-h-[64px]"
          placeholder={t("placeholder", lang)}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2000}
          aria-label={t("label", lang)}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            className="gov-button-primary min-h-[44px]"
            disabled={asking || !question.trim()}
            aria-busy={asking}
          >
            {asking ? t("asking", lang) : t("ask", lang)}
          </button>
          <VoiceInput lang={voiceLang} onTranscript={(t2) => { setQuestion(t2); submit(t2); }} large />
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-gov-red">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge
              status={supported ? "verified" : "unverified"}
              label={supported ? t("supported", lang) : t("unsupported", lang)}
            />
            {intent ? <span className="text-xs text-gov-textSecondary">{intent}</span> : null}
          </div>
          <p className="text-sm text-gov-text leading-relaxed whitespace-pre-line">{answer}</p>
          <VoiceOutput text={answer} lang={voiceLang} />
          {limitations ? <p className="text-xs text-gov-textSecondary italic">{limitations}</p> : null}
          {sources.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gov-navy mb-1">{t("sources", lang)}</p>
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.sourceId} className="text-xs border rounded p-2 bg-white">
                    <div className="flex items-center gap-1 flex-wrap mb-1">
                      <StatusBadge
                        status={sourceBadge(s.sourceType as any).status}
                        label={SOURCE_CLASS_LABEL[s.sourceType] ?? s.sourceType}
                      />
                      <span className="font-medium text-gov-text">{s.title}</span>
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gov-navy underline break-all"
                        >
                          {s.url}
                        </a>
                      ) : null}
                    </div>
                    <div className="text-gov-textSecondary">{sourceReviewLabel({ lastReviewed: s.lastReviewed })}</div>
                    {s.relevantExcerpt ? <p className="mt-1 text-gov-text">{s.relevantExcerpt}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
