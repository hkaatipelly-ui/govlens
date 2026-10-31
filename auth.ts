import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {
  googleRoleForVerifiedEmail,
  googleSignInApproved,
  oauthConfigurationStatus,
} from "./lib/auth/oauthGuards";

/**
 * GovLens public authentication (Auth.js v5 / next-auth beta, Google-only).
 *
 * - ANY verified Google account may sign in (no owner-email allowlist).
 * - OWNER_GOOGLE_EMAIL is a role marker ONLY: the matching verified account gets
 *   role "owner"; every other verified account gets role "user". Missing
 *   OWNER_GOOGLE_EMAIL never blocks ordinary users — owner controls simply
 *   stay unavailable.
 * - The Google subject identifier (`sub`) is persisted in the server-managed
 *   JWT and exposed as session.user.id — identity is derived server-side from
 *   Google's authenticated identity, never from browser JSON.
 * - The legacy OWNER_ACCESS_CODE gate is independent (see lib/auth/owner.ts)
 *   and never participates in this flow.
 *
 * Safe diagnostics: log events include only counters/categories/roles. OAuth
 * tokens, client secrets, API keys, cookies, and user emails are never logged.
 */

// Re-exported for parity; unit tests import the pure helpers from
// lib/auth/oauthGuards so they never need the NextAuth runtime.
export { googleSignInApproved, googleRoleForVerifiedEmail, oauthConfigurationStatus };

function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ component: "authjs", event, ...fields }));
}

const googleProvider = Google({
  authorization: {
    params: {
      prompt: "select_account",
    },
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [googleProvider],
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async signIn({ account, profile }) {
      const verdict = googleSignInApproved(account, profile);
      if (!verdict.ok) {
        // Category only: never the email value, tokens, or profile contents.
        logEvent("signin_rejected", { reason: verdict.reason });
        return false;
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        // Persist the Google subject identifier (`sub`) as the session identity.
        if (typeof profile?.sub === "string" && profile.sub) {
          token.sub = profile.sub;
        } else if (user?.id) {
          token.sub = user.id;
        }
        if (
          profile?.email_verified === true &&
          typeof profile?.email === "string" &&
          profile.email.trim()
        ) {
          token.role = googleRoleForVerifiedEmail(profile.email);
          logEvent("session_created", { role: token.role });
        } else {
          token.role = "user";
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Server-established identity: stable Google-derived subject id + role.
      if (token?.sub && session.user) session.user.id = String(token.sub);
      if (session.user) {
        session.user.role = googleRoleForVerifiedEmail(token?.email ?? session.user.email);
      }
      return session;
    },
  },
  pages: {
    signIn: "/owner",
    error: "/owner",
  },
});
