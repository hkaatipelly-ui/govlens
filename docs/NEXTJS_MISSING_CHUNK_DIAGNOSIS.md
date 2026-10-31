# Next.js missing-chunk diagnosis and durable fix (GovLens)

## Confirmed root cause
Overlapping writes to the same Next.js output directory. A long-running `next dev`
server and separate `next build`/`next start` commands originally used the default
`.next` directory. The dev server could keep serving hashed chunk references that
a later build replaced, producing errors such as `Cannot find module './8948.js'`.

Evidence:
- package scripts originally used the default `.next` for `dev`, `build` and `start`.
- no custom webpack or chunk-copying configuration exists; `next.config.mjs` only
  had `reactStrictMode`.
- an active `next dev` process was present while build/test work ran.
- after stopping processes, using isolated output directories, and building only
  after dev shutdown, `/`, `/scan`, `/services` and `/grievances` returned 200
  with no missing-chunk error.

## Durable configuration
`next.config.mjs` now uses `distDir: process.env.NEXT_DIST_DIR || ".next"`.

Package scripts:
- `dev`: `NEXT_DIST_DIR=.next-dev next dev`
- `dev:lan`: `NEXT_DIST_DIR=.next-dev next dev -H 0.0.0.0`
- `build`: `.next`
- `start`: `.next`
- `start:lan`: `.next -H 0.0.0.0`
- `clean:next`: removes only `.next` and `.next-dev`

`tsconfig.json` now includes `.next-dev/types/**/*.ts` in addition to
`.next/types/**/*.ts`.

## Files changed
- `next.config.mjs`
- `package.json`
- `tsconfig.json`
- `docs/NEXTJS_MISSING_CHUNK_DIAGNOSIS.md`

## Output directories
- development: `.next-dev`
- production build/start: `.next`

## Validation
- stopped all competing Next.js processes before cleaning
- cleaned `.next` and `.next-dev` only
- fresh development startup succeeded and routes returned 200
- production build succeeded
- production start succeeded and all four routes returned 200
- lint passed
- typecheck passed
- 255 tests passed

## Remaining risks
- Do not manually point dev and production at the same distDir.
- `clean:next` only removes generated Next.js output; it does not touch source,
  databases, environment files or user data. (It removes `.next` and `.next-dev`.)