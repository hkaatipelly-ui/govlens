import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { issueOwnerSession, setOwnerCookie, clearOwnerCookie } from "./lib/auth/owner";

function allowedOwnerEmail(): string {
  return (process.env.OWNER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
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
      if (account?.provider !== "google") return false;
      const rawEmail = profile?.email;
      if (!rawEmail) return false;
      if (profile?.email_verified !== true) return false;
      return true;
    },
  },
  events: {
    async signIn({ account, profile }) {
      try {
        const rawEmail = profile?.email;
        const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
        const isOwner = account?.provider === "google" && email && email === allowedOwnerEmail();
        if (isOwner) {
          const session = issueOwnerSession();
          setOwnerCookie(session);
        } else {
          clearOwnerCookie();
        }
      } catch {
        clearOwnerCookie();
      }
    },
    async signOut() {
      clearOwnerCookie();
    },
  },
  pages: {
    signIn: "/owner",
    error: "/owner",
  },
});
