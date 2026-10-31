# Vercel deployment checklist — GovLens

## Git safety checks
- `.env.local` is gitignored and must not be committed.
- Verify `git ls-files .env.local` returns no output.
- No real API key is present in source, examples, logs, or docs.
- No `NEXT_PUBLIC_` secret exists.

## Required Vercel environment variables
- `GEMINI_API_KEY` (server-side secret).
- `GEMINI_ENABLED=true`.
- `GEMINI_MODEL=gemini-3.8-flash`.
- `GEMINI_TIMEOUT_MS=540000` for Pro; on Hobby reduce to a value under 300000 ms.
- `GEMINI_MAX_OUTPUT_TOKENS=1024`.
- `OWNER_ACCESS_CODE=<at least 8 characters>`.
- `CASEWORKER_ACCESS_CODE`.
- `GEMINI_DATA_PROTECTION_MODE=paid` and `GEMINI_PAID_API_BILLING_CONFIRMED=true` only if sensitive document processing is intended.
- `GEMINI_ALLOW_SENSITIVE_DOCUMENTS` only if intentionally enabled.
- `DATABASE_PATH` must point to persistent external storage before production use with durable data.

## Runtime and function settings
- Document analysis route: `app/api/analyze/route.ts` uses `runtime = "nodejs"` and `maxDuration = 300`.
- For Vercel Pro, raise `maxDuration` to 600 seconds if needed, while keeping Gemini SDK timeout shorter than the function budget.
- Do not change unrelated route durations.

## Persistence blocker
- GovLens uses Node `node:sqlite` with a local file path (`DATABASE_PATH` default `.govlens-data/govlens.db`).
- Vercel serverless functions are ephemeral and will not reliably retain SQLite data across deployments/invocations.
- Do not silently substitute another database.
- Before production, either configure a persistent volume/external SQLite-compatible database or migrate to an approved external database.

## Upload constraints
- Vercel Functions accept roughly 4.5 MB request body.
- Existing `MAX_FILE_SIZE` is 15 MB and can exceed that limit when routed through `/api/analyze`.
- Direct-to-storage uploads are the recommended production approach for large documents.

## Deployment steps
1. Run `npm run lint`, `npm run typecheck`, `npm test`, then `npm run build`.
2. Commit only source and docs; exclude `.env.local`.
3. Push to GitHub.
4. Import repository into Vercel.
5. Add required environment variables in the Vercel project settings.
6. Deploy.
7. Verify `/api/health` returns Gemini configured.
8. Run a non-sensitive document scanning smoke test with explicit consent.

## Known limitations
- SQLite persistence on Vercel is not durable.
- A nine-minute Gemini timeout cannot complete on Vercel Hobby.
- Live Gemini availability and quota are external dependencies.