export interface PortalService {
  id: string;
  icon: string;
  title: string;
  titleTe: string;
  description: string;
  color: string;
  href: string;
}

export const POPULAR_SERVICES: PortalService[] = [
  {
    id: "certificates",
    icon: "📜",
    title: "Certificates",
    titleTe: "ధృవీకరణ పత్రాలు",
    description: "Income, caste, birth & death certificates via MeeSeva",
    color: "border-t-4 border-t-gov-blue",
    href: "/scan",
  },
  {
    id: "education",
    icon: "🎓",
    title: "Education",
    titleTe: "విద్య",
    description: "Scholarships, admissions & fee reimbursement",
    color: "border-t-4 border-t-gov-green",
    href: "/schemes",
  },
  {
    id: "utilities",
    icon: "💡",
    title: "Utilities",
    titleTe: "యుటిలిటీలు",
    description: "Ration card, Aadhaar update & civil supplies",
    color: "border-t-4 border-t-gov-saffron",
    href: "/scan",
  },
  {
    id: "schemes",
    icon: "🌾",
    title: "Schemes",
    titleTe: "పథకాలు",
    description: "PM-KISAN, welfare schemes & eligibility",
    color: "border-t-4 border-t-gov-green",
    href: "/schemes",
  },
  {
    id: "notices",
    icon: "📢",
    title: "Notices",
    titleTe: "నోటీసులు",
    description: "Understand official notices in simple words",
    color: "border-t-4 border-t-gov-blue",
    href: "/scan",
  },
  {
    id: "applications",
    icon: "📝",
    title: "Applications",
    titleTe: "దరఖాస్తులు",
    description: "Track applications & acknowledgement receipts",
    color: "border-t-4 border-t-gov-saffron",
    href: "/documents",
  },
];

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Scan",
    titleTe: "స్కాన్",
    text: "Capture your notice, form or receipt with the phone camera.",
  },
  {
    step: "02",
    title: "Understand",
    titleTe: "అర్థం చేసుకోండి",
    text: "Local AI reads it and explains it in simple English or Telugu.",
  },
  {
    step: "03",
    title: "Ask",
    titleTe: "అడగండి",
    text: "Ask questions by voice or text — answers stay grounded in official sources.",
  },
  {
    step: "04",
    title: "Act",
    titleTe: "చర్య",
    text: "Get a checklist of documents and steps, and raise a case if needed.",
  },
];

export const QA_EXAMPLES = [
  "What do I need to submit?",
  "When is the deadline?",
  "Explain this in Telugu.",
];

export const HELP_FAQS = [
  {
    q: "Is my document uploaded to the internet?",
    a: "No. GovLens runs fully on this device. OCR happens in your browser and AI analysis runs on local Ollama. Nothing is sent to any cloud server.",
  },
  {
    q: "Which languages are supported?",
    a: "English, Telugu (తెలుగు) and Hindi (हिन्दी) for questions and voice. Document summaries are available in English and Telugu.",
  },
  {
    q: "What if GovLens cannot verify something?",
    a: "It will say so clearly — “I could not verify this from the official information available to GovLens” — instead of guessing. Always confirm deadlines, fees and eligibility at the department counter.",
  },
  {
    q: "What does “Grounded / Unverified” mean?",
    a: "Grounded means the answer is backed by official documents stored in GovLens. Unverified means no matching official information was found.",
  },
  {
    q: "How do I send my case to a caseworker?",
    a: "After analysis, tap “Create Case”. It appears on the Caseworker Portal on the laptop (open the same GovLens address on the laptop browser).",
  },
];
