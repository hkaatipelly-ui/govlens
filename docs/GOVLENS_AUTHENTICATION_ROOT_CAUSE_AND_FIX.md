# GovLens authentication — root cause and fix (public Google login)

**Date:** 2026-10-31
**Status:** Code paths fixed and covered by mocked-OAuth tests. Ready to redeploy;
live Google OAuth behavior requires the Vercel env vars and matching Google Cloud
redirect URI (steps in the next section).

## 1. Root causes (found in the previously-deployed main branch)

Although public Auth.js/Google sign-in existed in parts of the codebase, several
legacy owner-code artifacts were still wired into the normal login and
document-analysis paths:

1. **Legacy owner code in the login surface.**
   `app/services/api.ts` called `/api/owner/login` via `apiOwnerStatus()`, and
   `/owner` treated `{ authenticated, configured }` from that route as the sign-in
   state — so an unconfigured legacy `OWNER_ACCESS_CODE` blocked/limited the
   sign-in experience even though Google sign-in never needs it.
2. **Owner cookie as an AI gate.**
   `lib/ai/providerPolicy.requireOwnerLocalAI(isOwner())` decided engine access in
   `/api/analyze`, `/api/ask` (document path), and `/api/translate` using the
   legacy HMAC owner cookie issued by the access-code route. A normal Google user
   could not analyze documents without being the configured owner.
3. **Legacy owner-code path was evaluated inside sign-in events.**
   `auth.ts` issue-owner-cookie logic in `events.signIn` depended on
   `OWNER_ACCESS_CODE`; with OWNER_GOOGLE_EMAIL-only configuration it could throw
   (`ownerAccessCode()` crashed on a missing code `undefined.trim()`), so legacy
   configuration could interfere with the Google sign-in event path.
4. **Identity inconsistency.**
   `/api/analyze` derived user ids from a Google-derived helper while
   `scopedAuthUserId()` derived them from the session EMAIL hash — the same
   account could be represented by two different server-side ids depending on the
   endpoint.
5. **Missing module.**
   `lib/auth/googleAuth.ts` (imported by `/api/analyze`) was not present on the
   deployed main branch, leaving an unresolved import.
6. **Stale role trust room.**
   The session role could be honored without re-validating against the
   configured owner email.

## 2. The fix — one authoritative Auth.js (next-auth v5 beta) flow

### auth.ts
- Google provider, `trustHost`, `AUTH_SECRET` retained.
- `signIn` gate (pure helper `lib/auth/oauthGuards.googleSignInApproved`):
  provider must be Google AND `email_verified === true` AND email present.
  **There is no owner-email allowlist in sign-in** — any verified Google account
  is approved; `OWNER_GOOGLE_EMAIL` missing/mismatched never blocks login.
- `jwt` callback persists the Google subject identifier (`sub`) as the token
  identity and stores a `role` derived via
  `googleRoleForVerifiedEmail()` (OWNER_GOOGLE_EMAIL → owner, everything else →
  user). Structured log events (`signin_rejected`, `session_created`) carry only
  categories/roles — no emails, tokens, or secrets.
- `session` callback exposes `session.user.id` (Google `sub`) and
  `session.user.role` re-derived from the session email against the current
  `OWNER_GOOGLE_EMAIL` (never a stale or client-supplied value).
- Removed all legacy owner-cookie issuance/clearing from sign-in events.

### lib/auth/googleAuth.ts (`requireAuthenticatedUser()`)
- Uses the Auth.js server `auth()` session only — request JSON/body fields and
  client-supplied role/userId/owner flags are never read.
- Returns `{ email (verified, normalized), userId (derived from the persisted
  Google `sub`), role ("owner"|"user" by server email match), emailVerified }`.
- Distinguishes failures:
  `401 GOOGLE_AUTH_REQUIRED` (no session),
  `401 GOOGLE_SESSION_ERROR` (session retrieval failure),
  `503 OAUTH_NOT_CONFIGURED` / `503 AUTH_SECRET_MISSING` (server setup).
  Normal Google users never see an owner-access-code error.
- Owner determination: verified session email === `OWNER_GOOGLE_EMAIL` (server
  env). Token/session role hints can never promote a different account.

### lib/auth/identity.ts
- New `googleSubjectUserId(subject)` — stable server-side user id hashed from the
  Google `sub` + `AUTH_SECRET`.
- `scopedAuthUserId()` now derives EXACTLY the same id from the session subject,
  so analyze/document-Q&A/grievances/cases/report/evidence all scope data to ONE
  consistent identity per Google account. Anonymous visitors keep the existing
  anonymous-cookie behavior (caseworker gate untouched).
- Historic note: earlier email-derived ids (`googleUserId`) are kept only as a
  documented legacy helper; per-user data created by previous dev sessions under
  email-derived ids may become orphaned after this change (the Vercel runtime DB
  is ephemeral anyway).

### Document-analysis path (`/api/analyze`, `/api/ask` A, `/api/translate`)
- Authorization: `requireAuthenticatedUser()` (any verified Google user may
  analyze their OWN permitted documents). Unauthenticated → HTTP 401.
- Engine selection: new `requireDocumentAnalysisAI()` — Gemini-only after
  `geminiConfigurationIssue()` passes. The old `requireOwnerLocalAI(isOwner())`
  calls were REMOVED from these routes; analyze's dead
  `SENSITIVE_DOCUMENT_REQUIRES_LOCAL_AI` "switch to local AI" branch was removed.
- Preserved unchanged: explicit cloud-processing consent (`403
  CLOUD_CONSENT_REQUIRED` otherwise), sensitive-document restrictions (`403
  SENSITIVE_DOCUMENT_BLOCKED`, `GEMINI_ALLOW_SENSITIVE_DOCUMENTS` behavior,
  `GEMINI_DATA_PROTECTION_MODE`), per-request streaming, evidence verification,
  data isolation.

### Owner/admin surfaces
- `/owner` (`app/owner/page.tsx`) is a session page: it reads `/api/auth/session`
  via `apiAuthStatus()` (Auth.js shape mapping). Unauthenticated →
  "Continue with Google" only (no OWNER_ACCESS_CODE warning or allowlist copy);
  normal user → "Signed in successfully" + "Go to Document Scanner"; owner →
  additionally owner dashboard controls. Sign-in redirects to the originally
  requested page constrained to same-site paths (no external redirects).
- `/api/owner/login` is now an explicitly LEGACY, independent owner-code admin
  gate. It is not part of the normal login/session flow and cannot block Google
  login or document analysis. Deployments with OWNER_GOOGLE_EMAIL-only
  configuration get a clear `OWNER_NOT_CONFIGURED` message from the legacy route
  instead of confusing errors. Client helpers for the legacy route were removed
  from `app/services/api.ts`.
- `lib/auth/owner.ts`: legacy code/throttle/HMAC session retained for the legacy
  gate ONLY (unit-tested), plus a new `isGoogleOwner()` (Auth.js-based owner
  check) and the `ownerAccessCode()` crash fix for Google-only configuration.
- `/api/cases` AI checklist enrichment now requires any authenticated Google
  user instead of the legacy owner cookie (anonymous users get the rule-based
  checklist only).
- Owner management APIs remain owner-only independent checks; caseworker APIs
  keep their separate caseworker gate.

### New diagnostics
- `GET /api/auth/status` — public-safe: configuration booleans only (never
  credential values), the caller's own session state/role, and the flow
  description (verified email requirement, subject persistence, role
  determination, redirect hint).
- Structured logs: `signin_rejected {reason}` (provider_mismatch |
  email_missing | email_unverified), `session_created {role}`,
  `session_retrieval_failed {errorName}`. No tokens/secrets/emails/cookies are
  ever logged.
- `lib/auth/oauthGuards.ts` — dependency-free pure helpers so unit tests mock
  `@/auth` without loading the NextAuth runtime.

## 3. Required production environment (Vercel)

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Auth.js session secret |
| `AUTH_GOOGLE_ID` | Google OAuth client id |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `OWNER_GOOGLE_EMAIL` | Role marker ONLY (owner gets "owner", else "user"); optional for public login |
| `GEMINI_ENABLED=true` | Enables Gemini document analysis |
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | e.g. `gemini-3.8-flash` |
| `GEMINI_TIMEOUT_MS` | e.g. `540000` (Pro) |

- `OWNER_ACCESS_CODE` must NOT be required for public Google authentication
  (legacy admin gate only).
- No secret is exposed via `NEXT_PUBLIC_*`.
- Google Cloud OAuth app (for `https://govlensnew.vercel.app`):
  - Authorized redirect URI exactly:
    `https://govlensnew.vercel.app/api/auth/callback/google`
  - Publishing status: `In production`.

## 4. Automated tests (mocked OAuth + offline Gemini)

`tests/auth-flow.test.ts` (26 tests) covers:
1. Sign-in gate allows ANY verified Google email (no allowlist).
2. Unverified Google identity rejected (`email_unverified`).
3. Missing email rejected (`email_missing`); non-Google provider rejected
   (`provider_mismatch`).
4. Non-owner verified email → role `user`.
5. `OWNER_GOOGLE_EMAIL` match → role `owner`.
6. Missing `OWNER_GOOGLE_EMAIL` does not block ordinary login (role still
   "user"; sign-in still approved).
7. `googleSubjectUserId` deterministic, per-subject distinct, secret-dependent.
8. `requireAuthenticatedUser`: no session → `401 GOOGLE_AUTH_REQUIRED`; missing
   credentials → `503 OAUTH_NOT_CONFIGURED` (not a misleading auth error);
   subject-derived userId; owner email → owner; a different account can NEVER
   become owner even with a spoofed role field; distinct ids per account
   (isolation primitive).
9. `requireDocumentAnalysisAI` Gemini-only; loud `503` instead of provider
   fallback when Gemini disabled.
10. Route gates: `/api/analyze` unauthenticated → 401; authenticated normal
    user NOT 401 (fails on missing CONSENT 403, never on owner status);
    consent mandatory even for owner; sensitive document → 403 even with
    consent; `/api/ask` unauth 401; sensitive docText 403; `/api/translate`
    unauth 401 + sensitive 403.
11. Legacy owner-code route behavior retained (separate suite
    `tests/owner-ai-policy.test.ts`, unchanged passing: wrong code 401, client
    role flags never trusted 401, throttle 429, legacy config messages).

Full suite: 281 tests passing (`npm test`). Typecheck/lint/build pass.

## 5. Remaining LEGACY references (repo-wide search, each explained)

Searched terms: `OWNER_ACCESS_CODE`, `Only the configured project owner Google
account is authorized` (0 hits), `ownerConfigurationIssue`, `apiOwnerStatus` (0
hits after cleanup), `isOwner`, `requireOwnerLocalAI`.

| Reference | Location | Status |
| --- | --- | --- |
| `OWNER_ACCESS_CODE` mentions | `lib/auth/owner.ts`, `app/api/owner/login/route.ts`, `app/owner/page.tsx` comment, `app/api/analyze` comment, env examples, tests | Legacy owner-code gate (optional, independent admin endpoint) or docs; NOT in login/analysis paths |
| `ownerConfigurationIssue` | `lib/auth/owner.ts` (definition), `app/api/owner/login` (legacy route only) | Legacy-only |
| `isOwner` | `lib/auth/owner.ts` (legacy cookie check), `app/api/owner/login` GET | Legacy-only; owner APIs use `isGoogleOwner()` (Auth.js) |
| `requireOwnerLocalAI` | `lib/ai/providerPolicy.ts` (kept for its legacy unit tests), tests | Legacy alias; NOT called by routes |
| `verifyOwnerCode`, `verifyOwnerSession`, throttle | `lib/auth/owner.ts` + owner-policy tests | Legacy gate internals, unit-tested, unused by public flow |

## 6. Manual browser smoke test (after redeploy)

1. Open `https://govlensnew.vercel.app/api/auth/providers` → Google listed.
2. Open `/api/auth/session` in a private window → unauthenticated `{}`/`null`.
3. Open `/owner` → "Continue with Google" visible with NO access-code prompt.
4. Check `/api/auth/status` → `config.googleProviderEnabled: true`,
   `session.authenticated: false`.
5. Sign in with the designated owner Google account → "Signed in successfully";
   `/api/auth/status` → `session.role === "owner"`; owner dashboard link visible.
6. Sign out; sign in with a different verified Google account → role `user`;
   "Go to Document Scanner" works; no owner controls.
7. On `/scan`, no sign-in gate appears for the authenticated user; analyze a
   non-sensitive document WITH explicit cloud consent → analysis completes;
   without consent → `403 CLOUD_CONSENT_REQUIRED`.
8. Sensitive document (e.g., Aadhaar/FIR content) → `403 SENSITIVE_DOCUMENT_BLOCKED`.
9. Attempt an owner/admin endpoint as a normal user → still blocked.
10. Google Cloud Console redirect URI must match
    `https://govlensnew.vercel.app/api/auth/callback/google` exactly.

## 7. Known limitations / caveats

- Automated tests use MOCKED OAuth sessions; the real Google round trip can only
  be verified in the deployed environment (section 6). Unit-test success alone
  does not prove live sign-in works.
- Identity re-keying: per-user rows are now assigned subject-derived ids. Data
  created in previous sessions (email-derived ids) may orphan on local dev
  databases; deployed Vercel data was already ephemeral.
- `/api/auth/session` handler requires the Vercel env vars above; without
  `AUTH_GOOGLE_ID/SECRET` sign-in returns configuration errors by design.
- Persistence durability on Vercel remains a separate open blocker (see
  `docs/VERCEL_DEPLOYMENT_CHECKLIST.md`).
- Nothing was committed or pushed.
