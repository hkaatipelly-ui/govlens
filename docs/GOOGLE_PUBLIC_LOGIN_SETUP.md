# Google OAuth public login setup — GovLens

## OAuth setup
- Provider: Google.
- Google OAuth application type: Web application.
- Use Authorized JavaScript origins: `https://<your-domain>` (and localhost during development).
- Authorized redirect URIs:
  - `https://<your-domain>/api/auth/callback/google`
  - `http://localhost:3000/api/auth/callback/google`
- Scopes: `openid`, `email`, `profile` (no Gmail, Drive, Calendar or other sensitive scopes).

## Production publishing status
- While the OAuth app is in Testing mode, only configured Google test users can sign in.
- For public access, switch Google Auth Platform publishing status to `In production`.

## Required environment variables
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `OWNER_GOOGLE_EMAIL`

## Owner vs normal user
- Any verified Google account can sign in.
- If the email matches `OWNER_GOOGLE_EMAIL`, the account gets owner privileges.
- All other verified accounts get normal `user` access.
- `OWNER_GOOGLE_EMAIL` is not used as a login allowlist; it only separates owner from normal user.
- Server-side sessions remain authoritative; browser-supplied identity/role is never trusted.