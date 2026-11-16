<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repository

Two experiences share one Next.js app and one sign-in. The README is the full
reference; this is the short list of things that are easy to get wrong.

- **CA Field Reports**: `/field-reports`, the landing page. Code lives in
  `ca/` subfolders and `src/types/ca.ts`.
- **CX Field Reports**: `/projects`. Commissioning, AI diagnostics, exports.

## Ground rules

- **Do not regress CX.** Don't refactor CX code to suit CA. CA has changed
  only these CX-shared files, all additively:
  - `AppHeader` (switcher), `relayState` (landing), the projects-page eyebrow,
    the root description;
  - `proxy.ts` (matcher excludes `sw.js`, the manifest and the icon);
  - `apiClient.ts` (`apiPutForm`, `apiGetBlob`);
  - `lib/azure/cosmos.ts` (`databaseContainer`).
- **Never commit `.env*`**, and never print secrets. New settings get blank
  placeholders in `.env.example`.
- **No real data in tests or development.** CA defaults to
  `CA_DATA_MODE=mock`. Playwright intercepts CX `/api` calls. Never point
  tests at Cosmos or Blob.
- **Don't guess upstream behaviour.** How the CA application picks the
  "latest approved" drawing set, its API and its auth are unknown. Leave the
  `ca-app` stubs throwing `CaNotConfiguredError` and record questions in
  `docs/ca-integration-contracts.md`.
- **Start Tracking is a placeholder.** Don't add location tracking without a
  decision. See `docs/ca-positioning-research.md`.

## Conventions

- **Layering:** component → `src/services/*` (the only `fetch`, via
  `apiClient`) → `src/app/api/**` route handlers → `src/repositories/*` /
  `src/lib/azure/*` (`server-only`).
- **CA routes:** wrap handlers in `caRoute()` (`src/lib/ca/apiRoute.ts`) and
  validate in `src/lib/ca/validation.ts`.
- **CA errors:** test with `isCaError(error, "Name")`, never `instanceof`.
  Repositories are cached on `globalThis`, and route bundles have separate
  class copies.
- **Implementations:** chosen only in `src/repositories/ca/index.ts`. A new
  implementation must pass `tests/unit/ca/repositoryContract.test.ts`.
- **Offline-first CA writes:**
  - Save to IndexedDB and queue in the same transaction
    (`src/lib/ca/offline/*Store.ts`); the sync engine sends idempotent PUTs.
  - Ids are generated on the device (`src/lib/ca/ids.ts`).
  - The newer `clientUpdatedAt` wins on the server.
  - Never write CA data straight to the API from a component.
- **Reports open by query string** inside the Reports tab (`caReportPath`,
  `caNavigate`, `CaStateLink`), not by route segments. That is what makes
  offline-started reports open with no signal.
- **Issued revisions are immutable:** create-only, `{reportId}_r{n}`, Rev 0
  first. Nothing may update or delete one, or the files it references.
- **Print fidelity:** `src/components/ca/report/caReport.css` is a scoped port
  of the template. Keep photo rows (`photoRows`) unbreakable, lone photos in
  the left column, two empty boxes for no photos, and `object-fit: contain`.
- **Next 16:** use `await connection()` instead of `export const dynamic`.
  Route `params` are Promises. A "use client" module's exported constants
  can't be read as values by server components, and page files can only
  export the page.
- **Hooks lint** (`react-hooks/set-state-in-effect`, `react-hooks/refs`): set
  state in promise callbacks, not synchronously in effects, and don't read or
  write refs during render.

## Commands

```bash
npm run dev            # http://localhost:3000 (webpack; Turbopack is disabled)
npm run lint
npm run typecheck
npm test               # Vitest unit tests
npm run test:e2e       # Playwright: builds, serves on :3100, phone + desktop
E2E_DEV=1 npm run test:e2e   # against the dev server (offline tests need the build)
```

Before reporting work done: lint, typecheck, `npm test` and
`npm run test:e2e` all pass, and CX regression tests are included.
