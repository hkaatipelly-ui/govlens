# Google OAuth public login setup — GovLens

## OAuth setup
- Provider: Google.
- Google OAuth application type: Web application.
- Use Authorized JavaScript origins: `https://<your-domain>` (and localhost during development).
- Authorized redirect URIs (must match the deployed URL EXACTLY, or sign-in fails with an OAuth callback error):
  - `https://<your-domain>/api/auth/callback/google`
  - `https://govlensnew.vercel.app/api/auth/callback/google` (production deployment)
  - `http://localhost:3000/api/auth/callback/google` (local development)
- Scopes: `openid`, `email`, `profile` (no Gmail, Drive, Calendar or other sensitive scopes).

## Production publishing status
- While the OAuth app is in Testing mode, only configured Google test users can sign in.
- For public access, switch Google Auth Platform publishing status to `In production`.

## Required environment variables
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `OWNER_GOOGLE_EMAIL` (optional: role marker; without it ordinary users still log in
  but owner controls remain unavailable)

## Owner vs normal user
- Any verified Google account can sign in — `OWNER_GOOGLE_EMAIL` is NOT an allowlist.
- If the verified email matches `OWNER_GOOGLE_EMAIL`, that account gets owner privileges.
- All other verified accounts get normal `user` access.
- Server-side sessions remain authoritative; browser-supplied identity/role is never trusted.
- Owner/user role is derived server-side from the verified session email and the
  `OWNER_GOOGLE_EMAIL` marker; a role value coming from anywhere else can never make a
  different account an owner.

## How the flow works (Auth.js v5)
- Sign-in gate (`signIn` callback): Google provider + `email_verified === true` + email
  present; anything else is rejected (never an owner-allowlist rejection).
- Session identity: the Google subject identifier (`sub`) is persisted in the server-issued
  JWT and exposed as `session.user.id`; stable internal user ids are derived from that
  subject server-side (`lib/auth/identity.ts`, `googleSubjectUserId`).
- `/owner` and `/scan` read `/api/auth/session` (Auth.js), NOT the legacy owner status probe.
- After sign-in the user is redirected to their original requested page (same-site path
  only; external URLs are refused).
- Document analysis (analyze / document Q&A / translate) authorizes ANY authenticated
  Google user via `lib/auth/googleAuth.requireAuthenticatedUser()`; cloud consent and
  sensitive-document restrictions are enforced before any content is sent to Gemini.

## Safe diagnostics
- `GET /api/auth/status` reports non-secret configuration booleans, the caller's own
  session state and role, and the flow description. It never returns credentials, tokens,
  cookies, or emails.
- Structured sign-in logs contain only categories (`signin_rejected: email_missing |
  email_unverified | provider_mismatch`, `session_created: role`) — no email values,
  tokens, or secrets.
- Error code meanings:
  - `401 GOOGLE_AUTH_REQUIRED` — no authenticated session (normal sign-in prompt).
  - `401 GOOGLE_SESSION_ERROR` — session retrieval failed; sign in again.
  - `503 OAUTH_NOT_CONFIGURED` — `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` missing.
  - `503 AUTH_SECRET_MISSING` — `AUTH_SECRET` missing.
  - `503 PUBLIC_AI_NOT_CONFIGURED / PUBLIC_AI_DISABLED` — Gemini not configured/disabled.
  - `403 CLOUD_CONSENT_REQUIRED` — user has not given explicit cloud-processing consent.
  - `403 SENSITIVE_DOCUMENT_BLOCKED` — document matched sensitive-content restrictions.
  - `OWNER_NOT_CONFIGURED` (legacy route only) — legacy owner-code gate not configured.
  - `OWNER_LOGIN_FAILED` (legacy route only) — wrong legacy owner access code.

## Manual smoke test (after deploy)
1. Open `https://govlensnew.vercel.app/api/auth/providers` — Google is listed.
2. Open `/api/auth/session` in a private window — no authenticated user.
3. Open `/owner` — "Continue with Google" is visible with NO access-code prompt.
4. Sign in with the owner Google account — "Signed in successfully", role owner,
   owner dashboard available; run `GET /api/auth/status` → `session.role === "owner"`.
5. Sign out; sign in with another verified Google account — role `user`, no owner controls,
   "Go to Document Scanner" available.
6. Scan a non-sensitive document with explicit cloud consent — analysis completes.
7. Owner-only administration remains blocked for normal users.