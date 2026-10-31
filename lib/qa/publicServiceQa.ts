/**
 * Phase 4 — public-service question answering with retrieval and source
 * references (server-only).
 *
 * Pipeline (order matters):
 *   1. Deterministic intent classification. Unsupported intents (private-record
 *      retrieval, grievance-status claims, current deadlines, legal judgments)
 *      are answered LOCALLY — no privacy screen pass, no provider config
 *      needed, and NOTHING is transmitted to any provider.
 *   2. Privacy screen (Phase 2 rules + Phase 4G additions) — 403 before any
 *      transmission for likely personal/sensitive content.
 *   3. Retrieval over the curated knowledge base (existing chunk/rank code)
 *      plus reviewed service-directory records. Unreviewed ("sample") records
 *      and weakly-matching chunks are filtered out as insufficient evidence.
 *   4. No evidence at all → controlled unsupported answer, provider never
 *      called (the model is never asked to invent missing policy).
 *   5. Provider gate (Phase 2 policy: Gemini only, never Ollama fallback).
 *   6. Bounded, evidence-focused model request via the Gemini adapter
 *      (injection-resistant system prompt built inside GeminiEngine).
 *   7. Response assembly: source metadata comes ONLY from the service
 *      directory / database rows — never from model text. Model-cited ids are
 *      validated against retrieval (unknown ids are dropped), and any URL the
 *      model invents in its answer text is blanked.
 *
 * Contract (200):
 *   { answer, intent, supported, limitations, sources[], language, grounded }
 *   sources[] = { sourceId, title, url, sourceType, lastReviewed, relevantExcerpt }
 *   `grounded` is a legacy alias equal to `supported`.
 */
import { AIPolicyError, requirePublicQnAI } from "@/lib/ai/providerPolicy";
import { screenPublicQuestion, PUBLIC_QUESTION_HINT } from "@/lib/ai/geminiPrivacy";
import type { AIEngine } from "@/lib/ai/AIEngine";
import type { KnowledgeEngine, KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";
import { getKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { getSourceService, type GovernmentSource } from "@/lib/sources/SourceService";
import { listServices, searchServices } from "@/app/lib/service-directory";
import type { PublicService } from "@/app/types/service";

export type PublicLang = "en" | "te" | "hi";

export type PublicIntent =
  | "public_service_question"
  | "unsupported_private_record"
  | "unsupported_grievance_status"
  | "unsupported_current_deadline"
  | "unsupported_legal_judgment"
  | "unsupported_no_evidence";

export interface AnswerSource {
  sourceId: string;
  title: string;
  url: string | null;
  sourceType: string;
  lastReviewed: string | null;
  relevantExcerpt: string;
}

export interface PublicAskResponse {
  answer: string;
  intent: PublicIntent;
  supported: boolean;
  limitations: string;
  sources: AnswerSource[];
  language: PublicLang;
  /** Legacy alias (AskResponse compat): always equals `supported`. */
  grounded: boolean;
}

// ---------------------------------------------------------------------------
// Intent classification (deterministic, English-pattern based; Telugu/Hindi
// questions fall through to retrieval — see Limitations in the phase report).
// ---------------------------------------------------------------------------

const INTENT_RULES: Array<{ intent: PublicIntent; pattern: RegExp }> = [
  {
    intent: "unsupported_grievance_status",
    pattern:
      /\b(?:was|is|has|have|were)\s+(?:my|our|this|the)?\s*(?:grievance|complaint|request)\s+(?:been\s+)?(?:registered|filed|submitted|received|acknowledged|accepted|resolved|closed|rejected)\b|\b(?:has|was|is)\s+(?:it|this)\s+(?:been\s+)?(?:registered|filed|received|acknowledged)\b|\b(?:successfully\s+)?(?:registered|filed)\s+(?:my|our)\s+(?:grievance|complaint)\b|\b(?:my|our)\s+(?:grievance|complaint)\s+(?:number|reference|status)\b/i,
  },
  {
    intent: "unsupported_private_record",
    pattern:
      /\b(?:status\s+of|tracking\s+of|track|check|checking)\s+(?:my|our)\b|\b(?:my|our)\s+(?:application|pension|claim|case|file|record|certificate|refund|passbook)\s+(?:status|details|reference|number)\b|\b(?:show|give|fetch|retrieve|download|pull|send)\s+(?:me|us)?\s*(?:my|our)\s+(?:land|property|patta|plot|record|document|file|certificate|passbook|application)\b|\b(?:my|our)\s+(?:land|property|patta|plot|survey)\s+(?:record|details|status)\b|\bpersonal\s+(?:land|property)\s+(?:record|details)\b|\b(?:another|other|someone|somebody|third[-\s]party|neighbour|neighbor)\b[^\n]{0,40}\b(?:case|application|record|file|status|details|citizen)\b|\b(?:citizen|person|applicant)'s\s+(?:case|application|record|file|status)\b/i,
  },
  {
    intent: "unsupported_current_deadline",
    pattern:
      /\blast\s+date\s+to\s+(?:apply|submit|register|enrol|enroll|join)\b|\b(?:current|latest|final|upcoming|exact|today'?s?)\s+(?:deadline|last\s+date|due\s+date|final\s+date|cut[- ]?off)\b|\b(?:deadline|last\s+date|due\s+date|cut[- ]?off)\s+(?:for|of|in|on)\s+(?:the\s+)?(?:session|year|cycle)?.*?20\d\d\b|\b(?:what|when)\s+(?:is|was)\s+(?:the\s+)?(?:last|final)\s+(?:date|deadline|day)\b/i,
  },
  {
    intent: "unsupported_legal_judgment",
    pattern:
      /\bwill\s+i\s+win\b|\b(?:am|will|can)\s+i\s+(?:legally|lawfully|constitutionally)\s+(?:entitled|eligible|allowed|right)\b|\b(?:definitive|final|binding|authoritative)\s+(?:legal\s+)?(?:advice|opinion|judgment|judgement|verdict|ruling)\b|\bwhat\s+(?:will|would)\s+(?:the\s+)?court\s+(?:decide|order|rule|say)\b|\b(?:give|provide)\s+me\s+(?:a\s+)?(?:legal\s+)?(?:judgment|verdict|decision)\b/i,
  },
];

export function classifyPublicIntent(question: string): PublicIntent {
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(question)) return rule.intent;
  }
  return "public_service_question";
}

// ---------------------------------------------------------------------------
// Localized unsupported-answer texts (identifiers, URLs and official names
// are never translated — only the surrounding explanation is).
// ---------------------------------------------------------------------------

interface LocalizedText {
  answer: string;
  limitations: string;
}

const UNSUPPORTED_MESSAGES: Record<Exclude<PublicIntent, "public_service_question">, Record<PublicLang, LocalizedText>> = {
  unsupported_private_record: {
    en: {
      answer:
        "GovLens cannot show private records: it has no access to your — or anyone else's — personal application, land or case files, and it cannot check a status for you. Ask a general public-service question instead, for example “What documents are needed for a Dharani land passbook?”.",
      limitations:
        "No private record was retrieved. For your own record or status, use the official portal or office listed in the sources.",
    },
    te: {
      answer:
        "ప్రైవేట్ రికార్డులు చూపించలేము: మీ లేదా ఇతరుల వ్యక్తిగత దరఖాస్తు, భూమి లేదా కేసు ఫైళ్లకు GovLensకు యాక్సెస్ ఉండదు, మీ స్థితిని కూడా తనిఖీ చేయలేదు. బదులుగా సాధారణ ప్రభుత్వ సేవా ప్రశ్న అడగండి, ఉదా: “Dharani పాస్‌బుక్‌కు ఏ పత్రాలు కావాలి?”.",
      limitations:
        "ప్రైవేట్ రికార్డు తీసుకురాబడలేదు. మీ స్వంత రికార్డు లేదా స్థితి కోసం క్రింది మూలాల్లోని అధికారిక పోర్టల్ లేదా కార్యాలయాన్ని ఉపయోగించండి.",
    },
    hi: {
      answer:
        "GovLens निजी रिकॉर्ड नहीं दिखा सकता: आपकी या किसी और की व्यक्तिगत आवेदन, ज़मीन या मामले की फ़ाइलों तक इसकी पहुँच नहीं है, और यह आपकी स्थिति भी नहीं जाँच सकता। इसके बजाय एक सामान्य सार्वजनिक-सेवा प्रश्न पूछें, जैसे “Dharani पासबुक के लिए कौन-से दस्तावेज़ चाहिए?”।",
      limitations:
        "कोई निजी रिकॉर्ड नहीं मिला। अपने रिकॉर्ड या स्थिति के लिए नीचे दिए स्रोतों में आधिकारिक पोर्टल या कार्यालय उपयोग करें।",
    },
  },
  unsupported_grievance_status: {
    en: {
      answer:
        "GovLens cannot confirm that a grievance or complaint was registered, received or resolved — it does not file complaints and does not talk to government systems. Check the status on the official grievance portal using your registration number.",
      limitations:
        "No submission or status check was performed. Only the grievance authority can confirm registration.",
    },
    te: {
      answer:
        "ఫిర్యాదు నమోదు అయిందా, అందిందా లేదా పరిష్కరించబడిందా అని GovLens నిర్ధారించలేదు — GovLens ఫిర్యాదులు దాఖలు చేయదు, ప్రభుత్వ వ్యవస్థలతో సంప్రదించదు. మీ నమోదు నంబర్‌తో అధికారిక గ్రీవెన్స్ పోర్టల్‌లో స్థితిని చూడండి.",
      limitations:
        "ఎలాంటి సమర్పణ లేదా స్థితి తనిఖీ జరగలేదు. నమోదును గ్రీవెన్స్ అధికారి మాత్రమే నిర్ధారించగలరు.",
    },
    hi: {
      answer:
        "GovLens यह पुष्टि नहीं कर सकता कि शिकायत दर्ज, प्राप्त या निपटाई गई है — GovLens शिकायत दर्ज नहीं करता और सरकारी प्रणालियों से बात नहीं करता। अपने पंजीकरण नंबर के साथ आधिकारिक शिकायतपोर्टल पर स्थिति जाँचें।",
      limitations:
        "कोई जमा या स्थिति-जाँच नहीं हुई। पंजीकरण केवल शिकायत प्राधिकरण ही पुष्टि कर सकता है।",
    },
  },
  unsupported_current_deadline: {
    en: {
      answer:
        "GovLens does not verify current, changing deadlines: application cut-off dates change every cycle and its curated sources do not record them. Check the deadline on the official portal below before you apply.",
      limitations: "Deadline not verified against a current official notice.",
    },
    te: {
      answer:
        "మారే ప్రస్తుత గడువు తేదీలను (దరఖాస్తు చివరి తేదీ) GovLens ధృవీకరించదు: అవి ప్రతి సంవత్సరం మారతాయి, మా సమీక్షించిన మూలాల్లో అవి నమోదు కాలేదు. దరఖాస్తు చేసే ముందు క్రింది అధికారిక పోర్టల్‌లో గడువు తేదీని చూడండి.",
      limitations: "ప్రస్తుత అధికారిక నోటీసుతో గడువు తేదీ ధృవీకరించబడలేదు.",
    },
    hi: {
      answer:
        "GovLens बदलती, मौजूदा अंतिम तिथियों (आवेदन कट-ऑफ़) की पुष्टि नहीं करता: वे हर चक्र में बदलती हैं और हमारे समीक्षित स्रोतों में दर्ज नहीं हैं। आवेदन से पहले नीचे दिए आधिकारिक पोर्टल पर अंतिम तिथि जाँचें।",
      limitations: "अंतिम तिथि किसी मौजूदा आधिकारिक सूचना से सत्यापित नहीं है।",
    },
  },
  unsupported_legal_judgment: {
    en: {
      answer:
        "GovLens gives general public-service information only: it cannot issue a legal judgment, decide your case, or say whether you are legally eligible. For a definitive answer, consult a qualified advocate or the court concerned.",
      limitations: "General information only — not legal advice or an official decision.",
    },
    te: {
      answer:
        "GovLens సాధారణ ప్రభుత్వ సేవా సమాచారం మాత్రమే ఇస్తుంది: న్యాయతీర్పు ఇవ్వదు, మీ కేసును నిర్ణయించదు, మీరు చట్టపరంగా అర్హులా అని చెప్పదు. ఖచ్చితమైన సమాధానానికి అర్హులైన న్యాయవాదిని లేదా సంబంధిత కోర్టును సంప్రదించండి.",
      limitations: "ఇది సాధారణ సమాచారం మాత్రమే — న్యాయ సలహా లేదా అధికారిక నిర్ణయం కాదు.",
    },
    hi: {
      answer:
        "GovLens केवल सामान्य सार्वजनिक-सेवा जानकारी देता है: यह कानूनी फ़ैसला नहीं दे सकता, आपके मामले का निर्णय नहीं कर सकता, और यह नहीं बता सकता कि आप कानूनी रूप से पात्र हैं या नहीं। निश्चित उत्तर के लिए किसी योग्य वकील या संबंधित अदालत से सलाह लें।",
      limitations: "केवल सामान्य जानकारी — कानूनी सलाह या आधिकारिक निर्णय नहीं।",
    },
  },
  unsupported_no_evidence: {
    en: {
      answer:
        "GovLens has no reviewed public source with this information, so it will not guess an answer. Try again with simpler, general words, or check an official portal.",
      limitations: "No reviewed source matched the question.",
    },
    te: {
      answer:
        "ఈ ప్రశ్నకు GovLens సమీక్షించిన ప్రజా మూలంలో సమాచారం లేదు, కాబట్టి అనుమానంతో సమాధానం ఇవ్వదు. సరళమైన సాధారణ పదాలతో మళ్లీ ప్రయత్నించండి లేదా అధికారిక పోర్టల్‌ను చూడండి.",
      limitations: "ప్రశ్నకు సరిపోయే సమీక్షించిన మూలం లేదు.",
    },
    hi: {
      answer:
        "इस प्रश्न के लिए GovLens के समीक्षित सार्वजनिक स्रोत में जानकारी नहीं है, इसलिए यह अनुमान नहीं लगाएगा। सरल, सामान्य शब्दों में दोबारा पूछें या कोई आधिकारिक पोर्टल देखें।",
      limitations: "प्रश्न से मेल खाता कोई समीक्षित स्रोत नहीं मिला।",
    },
  },
};

const CONFLICT_NOTE: Record<PublicLang, string> = {
  en: "Retrieved sources for this topic disagree — they use different links or review dates. One may be outdated: treat this as general guidance and check the authoritative source before acting.",
  te: "ఈ అంశంపై తీసుకున్న మూలాలు భిన్నంగా ఉన్నాయి — వేర్వేరు లింక్‌లు లేదా సమీక్షా తేదీలు ఉన్నాయి. ఒకటి పాతదయ్యి ఉండవచ్చు: దీనిని సాధారణ మార్గదర్శిగా భావించి, చర్య తీసుకునే ముందు అధికారిక మూలాన్ని తనిఖీ చేయండి.",
  hi: "इस विषय पर मिले स्रोत असंगत हैं — उनके लिंक या समीक्षा तिथियाँ अलग-अलग हैं। कोई पुराना हो सकता है: इसे सामान्य मार्गदर्शन मानें और कोई कदम उठाने से पहले आधिकारिक स्रोत जाँचें।",
};

const UNKNOWN_CITATION_NOTE: Record<PublicLang, string> = {
  en: "Some references in the answer could not be matched to a retrieved source and were removed.",
  te: "సమాధానంలోని కొన్ని రిఫరెన్సులు తీసుకున్న మూలంతో సరిపోలలేదు, వాటిని తొలగించారు.",
  hi: "उत्तर के कुछ संदर्भ मिले स्रोत से मेल नहीं खाते और हटा दिए गए।",
};

function pointerSentence(service: PublicService, lang: PublicLang): string {
  const tail = service.officialUrl ? ` — ${service.officialUrl}` : "";
  if (lang === "te") return `సంబంధిత సమాచారానికి అధికారిక మూలం: ${service.title}${tail}.`;
  if (lang === "hi") return `संबंधित जानकारी के लिए आधिकारिक स्रोत: ${service.title}${tail}.`;
  return `Official source for related information: ${service.title}${tail}.`;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** A hit must match a source title or several terms to count as evidence. */
const MIN_EVIDENCE_SCORE = 3;
const EXCERPT_MAX = 420;

export interface EvidenceRetrieval {
  /** Model-facing evidence: real KB chunks plus synthesized service records. */
  hits: KnowledgeHit[];
  /** Assembled answer sources (directory/DB metadata only). */
  sources: AnswerSource[];
  /** Localized conflict note; "" when retrieved content is consistent. */
  conflictNote: string;
  /** Service records matched by the directory search (reviewed only). */
  matchedServices: PublicService[];
  /** DB rows fetched during assembly (used by conflict detection). */
  dbRows: Map<string, GovernmentSource>;
}

/** Metadata source for a knowledge-source id: curated service record first,
 *  then the `government_sources` DB row; never fabricated. */
function synthesizeServiceHit(service: PublicService): KnowledgeHit {
  return {
    chunkId: `svc:${service.slug}`,
    documentId: service.knowledgeSourceId as string,
    content: [service.summary, service.steps.slice(0, 3).join(" "), service.limitations]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1200),
    sourceMetadata: {
      id: service.knowledgeSourceId as string,
      title: service.title,
      department: service.department,
      state: service.jurisdiction,
      documentType: `service:${service.category}`,
      language: "en",
      sourceUrl: service.officialUrl ?? "",
      publishedDate: "",
      effectiveDate: "",
      lastVerified: service.lastReviewed ?? "",
      sourceType: service.sourceType,
      jurisdiction: service.jurisdiction,
    },
    score: 5,
    matchedTerms: [],
  };
}

export async function retrieveEvidence(
  kb: Pick<KnowledgeEngine, "search">,
  sources: { getSource(id: string): Promise<GovernmentSource> },
  question: string,
  lang: PublicLang
): Promise<EvidenceRetrieval> {
  const raw = await kb.search(question, 5);
  const kbHits = raw.filter(
    (h) => h.score >= MIN_EVIDENCE_SCORE && h.content.trim().length >= 40
  );

  // Reviewed directory records only — "sample" (unreviewed) records are never
  // evidence, and every reviewed record carries a knowledge source id.
  const reviewed = listServices().filter(
    (s) => s.lastReviewed !== null && s.knowledgeSourceId
  );
  const matchedServices = searchServices({ query: question, services: reviewed });

  const kbIds = new Set(kbHits.map((h) => h.documentId));
  const extraServices = matchedServices.filter(
    (s) => !kbIds.has(s.knowledgeSourceId as string)
  );
  const hits: KnowledgeHit[] = [...kbHits, ...extraServices.map(synthesizeServiceHit)];

  // Assemble sources: unique ids in retrieval order, metadata from the
  // curated service record when one exists, otherwise the DB row.
  const serviceById = new Map(
    listServices()
      .filter((s) => s.lastReviewed !== null && s.knowledgeSourceId)
      .map((s) => [s.knowledgeSourceId as string, s])
  );
  const seen = new Set<string>();
  const sourcesOut: AnswerSource[] = [];
  const dbRows = new Map<string, GovernmentSource>();

  for (const hit of hits) {
    const id = hit.documentId;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    let db: GovernmentSource | undefined;
    try {
      db = await sources.getSource(id);
      dbRows.set(id, db);
    } catch {
      db = undefined;
    }
    const service = serviceById.get(id);
    if (!service && !db) continue; // unknown id → never fabricate a source

    const url = service?.officialUrl ?? (db?.sourceUrl || null);
    sourcesOut.push({
      sourceId: id,
      title: service?.title ?? db?.title ?? id,
      url: url || null,
      sourceType: service?.sourceType ?? db?.sourceType ?? "official",
      lastReviewed: service?.lastReviewed ?? (db?.lastVerified || null),
      relevantExcerpt: (hit.content.trim() || service?.summary || "").slice(0, EXCERPT_MAX),
    });
  }

  const conflictNote = detectConflict(sourcesOut, serviceById, dbRows, lang);
  return { hits, sources: sourcesOut, conflictNote, matchedServices, dbRows };
}

// ---------------------------------------------------------------------------
// Conflict detection (deterministic — the model never decides this)
// ---------------------------------------------------------------------------

const TOPIC_STOP = new Set([
  "government", "india", "telangana", "official", "service", "services",
  "scheme", "schemes", "department", "via", "through", "process",
]);

function topicTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !TOPIC_STOP.has(t));
}

/** Same subject (title overlap ≥ 75% of the shorter title) with different
 *  URLs → the two sources may not agree. */
function sameTopic(a: string, b: string): boolean {
  const A = topicTokens(a);
  const B = topicTokens(b);
  const min = Math.min(A.length, B.length);
  if (min < 2) return false;
  const inter = A.filter((t) => B.includes(t)).length;
  return inter / min >= 0.75;
}

export function detectConflict(
  assembled: AnswerSource[],
  serviceById: Map<string, PublicService>,
  dbRows: Map<string, GovernmentSource>,
  lang: PublicLang
): string {
  // (a) Same source id: the curated service record disagrees with the DB row
  //     on link, review date or source classification.
  for (const src of assembled) {
    const service = serviceById.get(src.sourceId);
    const db = dbRows.get(src.sourceId);
    if (!service || !db) continue;
    const dbUrl = db.sourceUrl || null;
    const dbReviewed = db.lastVerified || null;
    const dbType = db.sourceType || "official";
    if (
      (service.officialUrl ?? null) !== dbUrl ||
      service.lastReviewed !== dbReviewed ||
      service.sourceType !== dbType
    ) {
      return CONFLICT_NOTE[lang];
    }
  }

  // (b) Two distinct sources about the same subject with different links.
  for (let i = 0; i < assembled.length; i++) {
    for (let j = i + 1; j < assembled.length; j++) {
      const a = assembled[i];
      const b = assembled[j];
      if (a.url && b.url && a.url !== b.url && sameTopic(a.title, b.title)) {
        return CONFLICT_NOTE[lang];
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Official-source pointer for unsupported answers
// ---------------------------------------------------------------------------

const POINTER_NOISE = new Set([
  "status", "track", "tracking", "check", "checking", "show", "give", "giving",
  "fetch", "retrieve", "download", "pull", "send", "application", "applying",
  "registered", "registering", "current", "personal", "record", "records",
  "details", "another", "other", "someone", "somebody", "citizen", "person",
  "applicant", "case", "file", "files", "what", "when", "where", "how", "was",
  "were", "been", "has", "have", "the", "my", "our", "your", "this", "that",
  "specific", "officially", "please", "tell", "know", "confirm", "whether",
  "was", "does", "did", "will", "can", "could", "about", "grievance-status",
  "number", "reference", "was", "official", "legally", "eligible", "definitive",
  "judgment", "judgement", "verdict", "deadline", "last", "date", "apply",
  "submit", "final", "latest", "today",
]);

/** Loose any-significant-token match over reviewed services — used only to
 *  point unsupported answers at an official source when one exists. */
export function findOfficialPointer(question: string): PublicService | undefined {
  const tokens = (question.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 4 && !POINTER_NOISE.has(t)
  );
  if (tokens.length === 0) return undefined;
  const reviewed = listServices().filter(
    (s) => s.lastReviewed !== null && s.officialUrl
  );
  let best: PublicService | undefined;
  let bestScore = 0;
  for (const s of reviewed) {
    const hay = `${s.title} ${s.aliases.join(" ")} ${s.summary} ${s.category} ${s.department}`.toLowerCase();
    const score = tokens.filter((t) => hay.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function pointerSource(service: PublicService): AnswerSource {
  return {
    sourceId: service.knowledgeSourceId ?? service.id,
    title: service.title,
    url: service.officialUrl,
    sourceType: service.sourceType,
    lastReviewed: service.lastReviewed,
    relevantExcerpt: service.summary.slice(0, EXCERPT_MAX),
  };
}

// ---------------------------------------------------------------------------
// Answer assembly
// ---------------------------------------------------------------------------

/** Blank any URL the model invented in its answer text (only URLs that match
 *  a retrieved source are kept). */
export function sanitizeAnswerUrls(answer: string, allowed: Set<string>): string {
  return answer.replace(/https?:\/\/[^\s)\]}]+/g, (raw) => {
    const bare = raw.replace(/[.,;:!?]+$/, "");
    return allowed.has(bare) ? raw : "…";
  });
}

function unsupportedResponse(
  intent: Exclude<PublicIntent, "public_service_question">,
  lang: PublicLang,
  pointer: PublicService | undefined
): PublicAskResponse {
  const msg = UNSUPPORTED_MESSAGES[intent][lang];
  const answer = pointer ? `${msg.answer} ${pointerSentence(pointer, lang)}` : msg.answer;
  return {
    answer,
    intent,
    supported: false,
    limitations: msg.limitations,
    sources: pointer ? [pointerSource(pointer)] : [],
    language: lang,
    grounded: false,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface PublicQaDeps {
  kb: Pick<KnowledgeEngine, "search">;
  sources: { getSource(id: string): Promise<GovernmentSource> };
  /** Invoked ONLY when a model call is actually needed (config gate). */
  engine: () => AIEngine;
}

export async function answerPublicServiceQuestion(
  input: { question: string; language: PublicLang },
  deps: Partial<PublicQaDeps> = {}
): Promise<PublicAskResponse> {
  const question = input.question;
  let lang = input.language;
  // Script detection (same rule the route used): Devanagari → Hindi,
  // Telugu script → Telugu (overrides).
  if (/[\u0900-\u097f]/.test(question)) lang = "hi";
  if (/[\u0c80-\u0cff]/.test(question)) lang = "te";

  // 1. Unsupported intents are answered locally — nothing is transmitted,
  //    no provider configuration is required.
  const intent = classifyPublicIntent(question);
  if (intent !== "public_service_question") {
    return unsupportedResponse(intent, lang, findOfficialPointer(question));
  }

  // 2. Privacy screen before any transmission (Phase 2 + Phase 4G).
  const verdict = screenPublicQuestion(question);
  if (!verdict.allowed) {
    throw new AIPolicyError(403, "SENSITIVE_QUESTION", PUBLIC_QUESTION_HINT);
  }

  // 3. Retrieval over curated records.
  const kb = deps.kb ?? getKnowledgeEngine();
  const sourceSvc = deps.sources ?? getSourceService();
  const retrieval = await retrieveEvidence(kb, sourceSvc, question, lang);

  // 4. No relevant evidence → controlled unsupported state, provider never
  //    asked to invent the missing policy.
  if (retrieval.sources.length === 0) {
    return unsupportedResponse("unsupported_no_evidence", lang, undefined);
  }

  // 5. Provider gate (Phase 2 policy: Gemini only; never Ollama fallback).
  const engine = (deps.engine ?? requirePublicQnAI)();

  // 6. Bounded, evidence-focused model request.
  const result = await engine.answerQuestion({
    question,
    documentText: "",
    language: lang,
    evidence: retrieval.hits,
    sourceConflictNote: retrieval.conflictNote || undefined,
  });

  // 7. Validate and assemble: source metadata from retrieval/DB only.
  const knownIds = new Set(retrieval.sources.map((s) => s.sourceId));
  const citedUnknown = (result.citedSourceIds ?? []).some((id) => !knownIds.has(id));
  const allowedUrls = new Set(
    retrieval.sources.map((s) => s.url).filter((u): u is string => !!u)
  );
  const answer = sanitizeAnswerUrls(result.answer, allowedUrls);

  const limitationParts = [
    (result.limitations ?? "").trim(),
    retrieval.conflictNote,
    citedUnknown ? UNKNOWN_CITATION_NOTE[lang] : "",
  ].filter(Boolean);
  const supported = result.grounded === true;

  return {
    answer,
    intent,
    supported,
    limitations: limitationParts.join(" "),
    sources: retrieval.sources,
    language: lang,
    grounded: supported,
  };
}
