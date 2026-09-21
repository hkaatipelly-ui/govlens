import type { Source } from "./government-source";

export interface Answer {
  text: string;
  sources: Source[];
  verified: boolean;
}

export const UNVERIFIED_FALLBACK =
  "I could not verify this from the official information available to GovLens.";
