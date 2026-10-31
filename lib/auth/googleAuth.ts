import { googleUserId } from "./identity";
import { AIPolicyError } from "../ai/providerPolicy";

export interface GoogleIdentity {
  email: string;
  userId: string;
  role: "user" | "owner";
}

function ownerGoogleEmail(): string {
  return (process.env.OWNER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
}

/** Verify a real Auth.js session. Never trusts browser-submitted identity. */
export async function requireAuthenticatedUser(): Promise<GoogleIdentity> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const rawEmail = session?.user?.email;
  if (!rawEmail) {
    throw new AIPolicyError(401, "GOOGLE_AUTH_REQUIRED", "Sign in with Google to continue.");
  }
  const normalisedEmail = String(rawEmail).trim().toLowerCase();
  const role: "owner" | "user" = ownerGoogleEmail() === normalisedEmail ? "owner" : "user";
  return { email: normalisedEmail, userId: googleUserId(normalisedEmail), role };
}
