# CA Field Reports — integration contracts

For the backend owner who will connect CA Field Reports to Parkhill systems.
It covers every seam between the CA feature and the outside world, what runs
today, and what must be confirmed or built before production.

The rule throughout: **nothing here guesses.** Where a fact about the CA
application (parkhill-ccr), its drawings or its API was not known, the code
had a stub that failed with a clear "not connected yet" message, and the
question was listed under [Open questions](#open-questions). Projects and
drawing sets are now connected to parkhill-ccr (§5).

---

## 1. How the pieces fit

```
Browser (phone)                        Next.js server                      Azure / upstream
──────────────                         ──────────────                      ────────────────
IndexedDB (photos, pins, drafts)       /api/ca/... route handlers          Cosmos  caProjects, caCapture,
   │  outbox + sync engine  ──PUT──▶      │   (caRoute: error mapping)              caDrawings, caReports
   │                                      ▼                                Blob    ca-files
src/services/ca/*  ◀── JSON ──     src/repositories/ca  (CaRepository)  ─▶  CaProjectSource  (projects)
                                   src/lib/ca/files     (CaFileStore)   ─▶  CaDrawingSource  (drawing sets)
```

Route handlers only ever talk to the interfaces in
[`src/lib/ca/contracts.ts`](../src/lib/ca/contracts.ts). Which implementation is
used is decided in one place,
[`src/repositories/ca/index.ts`](../src/repositories/ca/index.ts), from
[`src/lib/ca/config.ts`](../src/lib/ca/config.ts).

| Contract | `mock` (today) | Production implementation | Status |
| --- | --- | --- | --- |
| `CaRepository` | memory + `.ca-dev-data/db.json` | `cosmosCaRepository.ts` | **Built, unit-tested against an in-memory stand-in only. Never run against Cosmos.** |
| `CaFileStore` | local disk under `.ca-dev-data/files` | `blobFileStore.ts` | **Built, typechecked. Never run against Blob.** |
| `CaProjectSource` | 3 labelled sample projects | `ca-app` (parkhill-ccr `GET /api/projects`), falling back to `vantagepoint` (reuses CX lookup) | Built; ccr accepts the `FieldReports.Read` app-only token (§5) |
| `CaDrawingSource` | 2 labelled sample SVG sheets, and a 3-sheet sample PDF set "published" for the sample projects and `DC-…` projects | `ca-app`: the current set from ccr's **Document Control** module, synced on the server (§5) | Built; sync unit-tested, covered by e2e on the mock set |
| `CaReportRenderer` | — (browser print-to-PDF) | not built | Optional future |

## 2. Configuration

All blank placeholders are in `.env.example`. No CA setting is a secret.

| Variable | Values | Default |
| --- | --- | --- |
| `CA_DATA_MODE` | `mock` \| `azure` | `mock` in development; **required in production** (startup error if unset) |
| `CA_PROJECT_SOURCE` | `mock` \| `vantagepoint` \| `ca-app` \| `none` | `mock` in mock mode, else `ca-app` |
| `CA_PROJECT_FALLBACK_SOURCE` | `vantagepoint` \| `mock` \| `none` | `none` in mock mode, else `vantagepoint`. Used when the project source fails; manual entry is offered only when both fail |
| `CA_DRAWING_SOURCE` | `mock` \| `ca-app` \| `none` | `mock` in mock mode, else `ca-app`. Uploading a set by hand always works |
| `CA_SHEET_NAMING` | `openai` \| `mock` \| `none` | `openai` when `OPENAI_API_KEY` is set, else `none` (sheets named by hand). Tests use `mock` |
| `CA_APP_API_BASE_URL` | URL of the ccr backend, without `/api` | required for `ca-app`; when missing, New Project falls back and Add Drawing offers upload only |
| `CA_APP_API_SCOPE` | Entra scope: `api://4c90a6d1-7ffa-47df-8d48-46b9e9f698af/.default` (ccr's `contract-management-app`) | required for `ca-app`, as above |
| `CA_SYNC_TENANT_ID` | Entra tenant id | blank: ccr's drawing-set push answers 503; sets still sync on access (§5) |
| `CA_SYNC_API_AUDIENCE` | audience of ccr's token: Field Reports' Application ID URI and/or client id (comma-separated) | as above |
| `CA_SYNC_ALLOWED_CLIENT_ID` | client id of ccr's managed identity, the only caller accepted | as above |
| `COSMOS_CA_PROJECTS_CONTAINER` | name | `caProjects` |
| `COSMOS_CA_CAPTURE_CONTAINER` | name | `caCapture` |
| `COSMOS_CA_DRAWINGS_CONTAINER` | name | `caDrawings` |
| `COSMOS_CA_REPORTS_CONTAINER` | name | `caReports` |
| `AZURE_STORAGE_CA_CONTAINER` | name | `ca-files` |
| `CA_MOCK_DATA_DIR` | path | `.ca-dev-data` (git-ignored) |

`azure` mode reuses the CX settings `COSMOS_ENDPOINT`, `COSMOS_DATABASE` and
`AZURE_STORAGE_ACCOUNT`, and the same managed identity. **`azure` mode never
falls back to mock.** A missing piece is an error that says what is missing.
Mock mode always shows a yellow "MOCK DATA" banner and "MOCK" tags.

## 3. Azure

### Containers to provision

All four Cosmos containers use partition key **`/projectNumber`**, in the
existing database (`COSMOS_DATABASE`). The app never creates containers.

| Container | Documents (`type` field) | Notes |
| --- | --- | --- |
| `caProjects` | `project` (id = projectNumber) | Cross-partition query for the list (small) |
| `caCapture` | `photo`, `pin` (id = device-generated) | High write volume from sync |
| `caDrawings` | `drawing`, `drawingSet` (sheets with their numbers and names) | Low volume |
| `caReports` | `report`, `revision` (id `{reportId}_r{n}`), `counter` (id `reportCounter`) | Revisions are create-only |

Blob: one private container, `ca-files`, in the existing storage account.

| Path | Content |
| --- | --- |
| `{projectNumber}/photos/{photoId}.jpg` | Photos (downscaled on the device, ≤ 8 MB) |
| `{projectNumber}/drawings/{drawingId}.{png\|jpg\|webp}` | Drawing sheet images (≤ 25 MB) |
| `{projectNumber}/drawing-sets/{setId}.pdf` | Uploaded drawing-set PDFs (≤ 512 MB), uploaded as 8 MB staged blocks and committed as one block blob |

### Roles and settings

- The app identity already has Cosmos Built-in Data Contributor and Storage
  Blob Data Contributor + Storage Blob Delegator for CX. Confirm they cover
  the new containers. They do if they were granted at account scope.
- **Blob CORS:** allow `GET` from the app's origin on the storage account. The
  browser downloads drawing sheets with `fetch`, from short-lived SAS URLs, to
  keep them for offline use, and reads drawing-set PDFs with pdf.js. Allow the
  `Range` request header and expose `Accept-Ranges`, `Content-Range` and
  `Content-Length` so pdf.js fetches only the pages it needs (without them it
  downloads the whole PDF, which still works). Photos shown in `<img>` do not
  need CORS. Uploads go through the app, so no write CORS rule is needed.
- **Content Security Policy:** if a CSP is added later, `img-src` and
  `connect-src` must allow `https://{account}.blob.core.windows.net`.

### Before switching production to `CA_DATA_MODE=azure`

1. Provision the containers above in a **non-production** account.
2. Set `CA_DATA_MODE=azure` on a staging slot and run through:
   - creating a project;
   - taking photos (including offline), then syncing;
   - adding a drawing and dropping pins;
   - writing a report and issuing it;
   - re-issuing it.
3. Check the semantics the code relies on. These are exactly what the
   contract tests (`tests/unit/ca/repositoryContract.test.ts`) cover:
   - ETag `IfMatch` replaces return 412 on a lost race.
   - `create` returns 409 for an existing id.
   - Point reads of a missing id return no resource.
4. Decide retention. Issued revisions and the files they reference must
   never be deleted. Nothing in the app deletes them, and deleting a project
   with an issued report is refused.

## 4. HTTP API (browser ⇄ server)

All routes require the CX sign-in session (`src/proxy.ts`). Every write is
keyed by an id the **device** generated, so retries can never create
duplicates.

| Method & path | Purpose |
| --- | --- |
| `GET/POST /api/ca/projects` | List / create CA projects |
| `GET/PATCH/DELETE /api/ca/projects/{p}` | One project. DELETE is refused (409) if any report was issued |
| `GET /api/ca/source-projects` | `{source, fellBackFrom?, notice?, projects}`: projects from `CaProjectSource`, or the fallback source when it fails. Projects already set up here are included with `alreadyCreated: true` (shown greyed out). `source: null` means no source answered |
| `GET /api/ca/search?q=…` | Nav-bar search, 2–100 characters: `{projects, reports}`. Projects by number, name or client; reports in every project by number, author, discipline or project. At most 20 of each |
| `GET /api/ca/projects/{p}/photos` | Photos with read URLs |
| `PUT /api/ca/projects/{p}/photos/{photoId}` | Idempotent multipart upload: `meta` (JSON, optional `reportId`, kept from the first sync) + `file` (JPEG, first time only). Newer `clientUpdatedAt` wins |
| `GET /api/ca/projects/{p}/pins`, `PUT …/pins/{pinId}` | Pins. Deletion is `deleted: true`. Newer edit wins |
| `GET /api/ca/projects/{p}/drawings`, `PUT/PATCH …/drawings/{drawingId}` | Drawing sheets. PUT is multipart: `meta` (with `drawingSetId` for a sheet of an uploaded set) + sheet **image**. PATCH renames or marks superseded |
| `GET /api/ca/projects/{p}/source-drawings[?ref=…]` | What `CaDrawingSource` offers (each with `imported`: a drawing, or a live drawing set, carries its `externalRef`), or one offer's file, streamed |
| `GET /api/ca/projects/{p}/drawing-sets` | Drawing sets (not removed), with their sheets and a read URL for the PDF, and `syncing`. Also reconciles the project with ccr (at most every 5 minutes; waits up to 8 s for it) |
| `POST /api/ca/projects/{p}/drawing-sets/sync` | "Check for updates": reconcile now, ignoring the interval. 202 |
| `PUT /api/ca/projects/{p}/drawing-sets/{setId}/index` | `{pageCount, sheets}` of a synced set, from the first device to read it. Accepted once; 409 afterwards |
| `POST /api/ca/integrations/ccr/drawing-sets` | **ccr → Field Reports**, no session: `{projectNumber, versionId?, event}` with ccr's app-only token (§5). 202; reconciles after the response |
| `PUT /api/ca/projects/{p}/drawing-sets/{setId}/blocks/{n}` | One ≤ 8 MB block of the PDF (multipart `block`). Block 0 must start `%PDF-`. Re-sending replaces it |
| `PUT/PATCH/DELETE /api/ca/projects/{p}/drawing-sets/{setId}` | Commit the blocks and record the set (`{fileName, blockCount, pageCount, sheets, source?, externalRef?, revisionLabel?}`, idempotent; `source` must be the configured drawing source) / correct one sheet (`{page, sheetNumber, sheetName}`, marked edited) / remove (tombstone; the PDF is kept) |
| `POST /api/ca/projects/{p}/drawing-sets/{setId}/sheet-names` | `{pages}`: title-block text (or image) of ≤ 8 pages. Names them with `CA_SHEET_NAMING` and saves them; edited sheets are kept. 503 when naming is off |
| `GET /api/ca/projects/{p}/reports` | Reports |
| `GET/PUT/DELETE /api/ca/projects/{p}/reports/{id}` | Report and its revision list / idempotent create-or-save draft (`{draft, clientUpdatedAt, createdAt, discipline?}`; the first PUT fixes the discipline and stamps `createdBy` and `createdByName` from the session) / delete a never-issued draft |
| `POST /api/ca/projects/{p}/reports/{id}/issue` | `{expectedDraftUpdatedAt}`. Freezes the next revision and stamps Date Issued with the server clock. 409 if the stored draft is not the reviewed version. 422 if a photo has not uploaded. Safe to retry |
| `GET /api/ca/projects/{p}/reports/{id}/revisions/{n}` | One issued revision, with read URLs for its frozen photo paths |
| `GET /api/ca/files/{path}` | **Mock mode only.** In azure mode, read URLs are Blob SAS URLs and this returns 404 |

Error mapping (`src/lib/ca/apiRoute.ts`):

| Error | Response |
| --- | --- |
| `CaNotConfiguredError` | 503, with its message |
| Conflict, or revision already exists | 409 |
| Missing photo | 422 |
| Bad `CA_*` setting | 500, naming the variable |

## 5. Upstream sources

### `CaProjectSource` (`ca-app`): `src/repositories/ca/sources.ts`

The CA application is the **parkhill-ccr backend** (Express, Azure Web App
`parkhill-contract-management-backend`, all routes under `/api`). New Project
lists its projects; when it cannot be reached, the list comes from
VantagePoint instead (`CA_PROJECT_FALLBACK_SOURCE`).

**Endpoint.** `GET {CA_APP_API_BASE_URL}/api/projects` returns ccr's Cosmos
project documents (no paging). Mapping, in
[`src/lib/ca/ccrProjects.ts`](../src/lib/ca/ccrProjects.ts):

| ccr field | CA project | Notes |
| --- | --- | --- |
| `archProjectNumber` | `projectNumber` | e.g. `45371.25.01`; must pass `isValidProjectNumber`, else skipped |
| `name` | `name` | |
| `id` | `externalRef` | |
| `archived: true` | — | not offered |
| — | `client` | ccr has no client field; left empty for the engineer |

VantagePoint numbers (the fallback) are converted with ccr's own rule
(`archProjectNumberFromWbs`: `4537125.01` → `45371.25.01`) so the same project
gets the same number whichever list it was picked from. **To verify:** that
the Fabric `WBS1` column has that single-dot form; numbers in any other form
are used unchanged.

**Auth: an app role on ccr.** Field Reports signs in with SAML, so it has no
user token to pass on; it calls ccr with its own identity instead:

1. ccr's API app registration, `contract-management-app` (client id
   `4c90a6d1-7ffa-47df-8d48-46b9e9f698af`), defines the **application** app
   role `FieldReports.Read`.
2. That role is granted to the Field Reports App Service's managed identity
   (`Parkhill-Field-Reports`).
3. ccr's `backend/middleware/requireAuth.js` accepts app-only tokens with that
   role **only** on `SERVICE_ROUTE_GRANTS`: `GET /api/projects`,
   `GET /api/projects/number/:n` and the two Document Control `/service/`
   reads below. Anything else is 403 `service_route_not_allowed`. The project
   routes answer it with a slim view (`id`, `archProjectNumber`, `name`,
   `archived`, `status`).
4. Field Reports sets `CA_APP_API_BASE_URL` and `CA_APP_API_SCOPE`.

Field Reports gets the token with `DefaultAzureCredential` (the managed
identity in Azure, so the App Service must **not** set `AZURE_CLIENT_ID` /
`AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID`). Any failure (not configured, no
token, 401/403, timeout, 5xx, unexpected body) is logged on the server and
becomes a `CaNotConfiguredError`, which makes New Project fall back to
VantagePoint. Running locally, `az login` gives a *user* token, which ccr
refuses, so this only answers from the deployed App Service.

**Disciplines.** ccr's project roster (`team[].role`) uses `Arch`, `Civil`,
`MP`, `Elec` and `Struc`, which match the five report disciplines here
(Architecture, Civil, MP, Electrical, Structural). Not used yet; a later step
could show each discipline's lead on its report group.

### `CaDrawingSource` (`ca-app`): same file

Drawing sets come from ccr's **Document Control** module
(`backend/routes/documentControl.js`): one PDF per version, append-only; the
**current set is the highest version**, and ccr says so. Two service routes,
paths in [`src/lib/ca/ccrDrawings.ts`](../src/lib/ca/ccrDrawings.ts):

| ccr route | Field Reports |
| --- | --- |
| `GET /api/document-control/service/projects/number/{n}/latest` | `listLatest`: `[]` or the current set. **404** (project not in ccr) is `[]` |
| `GET /api/document-control/service/projects/number/{n}/versions/{versionId}/file` | `fetchFile`: the PDF, streamed through without buffering |

`/latest` items are already in the `CaSourceDrawing` shape (`toServiceDrawing`
in ccr): `externalRef` = the version id (`<ccr project id>-v<n>`), `title` =
the set's label ("100% CD"), `revisionLabel` = "v<n> — <label>",
`isLatestApproved: true`, `fileType: "pdf"`, `fileName`, `size` (→
`sizeBytes`). `mapCcrDrawings` offers only PDFs with a usable id, and keeps
`isLatestApproved` only when it is exactly `true`.

**How it is used: synced on the server.** Field Reports keeps its own copy
of each project's current set, in its own file store, and every report uses
that copy ([`src/lib/ca/drawingSync.ts`](../src/lib/ca/drawingSync.ts)).
`reconcile(project)` is the whole algorithm:

1. Ask ccr `/latest` which set is current (never inferred here).
2. If that version is not stored yet, stream its PDF from ccr into
   `{p}/drawing-sets/{setId}.pdf` (8 MB blocks, `%PDF-` checked, ≤ 512 MB)
   and record the set: `source`, `externalRef`, `revisionLabel`, `title`,
   `indexed: false`. The set id is derived from the version id
   (`dcset_<version id>`, `syncedSetId`), so pushes, listings and devices
   racing each other converge on one record; file and record are create-only.
   A version imported by hand before syncing existed counts as present.
3. Mark that set `isCurrent: true` and every other synced set `false`, and
   their sheets (drawings) likewise. **Nothing is deleted**: reports made
   with an older version keep it. A version deleted in ccr (a mistaken
   upload) simply stops being current, and the previous one is current again.

It runs (one run per project at a time, on `globalThis`):

| When | How |
| --- | --- |
| ccr publishes, relabels or deletes a version | ccr calls `POST /api/ca/integrations/ccr/drawing-sets` (below); forced |
| A project is set up in Field Reports | after the response; forced |
| A project's drawing sets are listed (Capture, Add drawing, starting a report) | at most every 5 minutes per project; the listing waits up to 8 s, else says `syncing` and the device asks again |
| "Check for updates" in Add drawing | `POST .../drawing-sets/sync`; forced |

The server has no PDF tooling, so it stores the PDF without reading it. The
first device to open the set lists its pages as sheets from their title blocks
(as for an upload), saves them once (`PUT .../index`; another device that
raced gets 409), and AI naming follows. Each sheet's image is rendered on a
device the first time someone opens that sheet, as a drawing with the id
`{setId}_p{page}` (`syncedSheetDrawingId`), so it is shared by every device
and cached for offline use. "Save all sheets for offline" renders the rest.

**Reports keep their version.** A report records the set it was started on
(`content.drawingSet`: `setId`, `revisionLabel`, `title`), from the server
when it answers within 3 s, else from the device's cache of the project's
sets. Capture and Site Route list that set's sheets (plus drawings added by
hand). A report never issued and started without one gets the current set
when Capture opens. The set's `revisionLabel`, exactly as ccr gives it, is
printed in the report header ("Drawing Set") and on each Photo Locations page
of a set sheet. Issued revisions freeze it with the rest of the content.

**The push (ccr → Field Reports).** `POST /api/ca/integrations/ccr/drawing-sets`,
body `{ projectNumber, versionId?, event: "published" | "updated" | "removed" }`.
Only ids: Field Reports then pulls the PDF through the read route it is
already granted, so ccr needs nothing new from Field Reports' side but this
call. Whatever the event, Field Reports reconciles against `/latest`, so a
lost, repeated or out-of-order push cannot leave the wrong set current; a
project not set up in Field Reports is ignored. `proxy.ts` lets the path
through without a session; the route checks, with `jose`
([`src/lib/ca/serviceAuth.ts`](../src/lib/ca/serviceAuth.ts)):

- a token signed by the tenant (`CA_SYNC_TENANT_ID`), v1 or v2 issuer;
- `aud` is `CA_SYNC_API_AUDIENCE`;
- an **app-only** token (no `scp`) with the application role
  `FieldReports.DrawingSync`;
- `azp`/`appid` is `CA_SYNC_ALLOWED_CLIENT_ID` (ccr's managed identity).

Setup (admin): Field Reports' app registration exposes an Application ID URI
and the application role `FieldReports.DrawingSync`, assigned to ccr's App
Service managed identity. ccr sets `FIELD_REPORTS_BASE_URL` and
`FIELD_REPORTS_SYNC_SCOPE` (`<Application ID URI>/.default`). Until then,
sets still sync whenever a project's drawings are opened.

Failures other than 404 (not configured, 401/403, timeout, 5xx) are logged and
shown as "could not be loaded" in the dialog, and a reconcile that fails
changes nothing (the next listing tries again); uploading a set by hand still
works. With no set in ccr, Capture shows "No floor plans yet" and Add drawing.

```ts
interface CaDrawingSource {
  kind: "ca-app";
  listLatest(projectNumber): Promise<CaSourceDrawing[]>;
  fetchFile(projectNumber, externalRef): Promise<{ bytes: Uint8Array | ReadableStream; contentType; fileName }>;
}
type CaSourceDrawing = { externalRef; title; sheetNumber?; revisionLabel?; isLatestApproved: boolean;
                         fileType: "pdf" | "image"; fileName; sizeBytes? };
```

A `pdf` offer is synced as a drawing set (Add drawing shows it as "Synced");
an `image` offer (the mock sheets) is imported by hand through the
page-and-title step as a single drawing.

### `CaSpecSource` (`ca-app`): same file

The project's **specifications**, from ccr's Document Control → Specifications
(`backend/routes/specifications.js`). Specs are one PDF per CSI MasterFormat
section (`03 30 00`), and **each section is revised on its own**, so there are
many current files per project, not one. Read-only reference here: no sheets,
no pins, no use on reports.

- `listCurrent` → `GET /api/document-control/specifications/service/projects/number/{n}/latest`:
  the current revision of every section (`toServiceSpecSection`, mapped by
  `mapCcrSpecSections` in `src/lib/ca/ccrSpecs.ts`). A 404 is "no sections".
- `fetchFile` → `.../revisions/{revisionId}/file`: one revision's PDF, streamed.
- Push: ccr POSTs `{ projectNumber, versionId?, event }` to
  `POST /api/ca/integrations/ccr/specifications` (same token check and
  `FieldReports.DrawingSync` role as the drawing-sets push; `versionId` is
  absent when one upload published several sections).

`reconcileSpecs` (`src/lib/ca/specSync.ts`) copies any current revision not
yet stored (4 at a time, `%PDF-` checked, block-staged like drawing sets), marks
exactly those current, and marks everything else not current — superseded
revisions and sections ccr no longer lists. Nothing is deleted. One section
failing to copy is logged, keeps its previous revision current, and is retried
on the next run. Scheduling (throttle, run-again on a forced push) is shared
with the drawing sync through `src/lib/ca/reconcileScheduler.ts`.

Specifications follow `CA_DRAWING_SOURCE`: there is no separate setting.

Records are `type: "specSection"` documents in the **existing** `caDrawings`
container (no new container), files at `{projectNumber}/specifications/{sectionId}.pdf`,
and record ids are derived from ccr's revision id (`syncedSpecSectionId`).

Browser API:
- `GET /api/ca/projects/{p}/specifications` → `{ sections, syncing, hasSource }`
  (current revisions, records only; triggers a throttled reconcile).
- `GET /api/ca/projects/{p}/specifications/{sectionId}` → `{ section, url }`.
- `POST /api/ca/projects/{p}/specifications/sync` — "Check for updates".

On the device, the **Specifications** tab caches the list and the PDF of every
section opened there (IndexedDB `specSections`, database version 5), so a
section opened once reopens offline. A superseded section's bytes are dropped
the next time the list refreshes.

```ts
interface CaSpecSource {
  kind: "mock" | "ca-app";
  listCurrent(projectNumber): Promise<CaSourceSpecSection[]>;
  fetchFile(projectNumber, externalRef): Promise<{ bytes: Uint8Array | ReadableStream; contentType; fileName }>;
}
type CaSourceSpecSection = { externalRef; sectionKey; sectionNumber; division; title; revision;
                             revisionLabel?; isLatestApproved: boolean; fileType: "pdf"; fileName;
                             sizeBytes?; uploadedAt? };
```

### `CaReportRenderer` (optional)

Server-side PDF of an issued revision, for a consistent filename or for pushing
to the CA app. Today the PDF is the browser's print of the template-faithful
page (Chrome or Edge, Letter, background graphics on). A renderer would load
`/field-reports/{p}/reports?report={id}&view=print&rev={n}` in headless
Chromium and call `page.pdf({ preferCSSPageSize: true })`. That is what the
Playwright tests do.

## 6. Data model

Defined once in [`src/types/ca.ts`](../src/types/ca.ts).

- **CaProject**: `id = projectNumber`, name, client, source (`ca-app` |
  `vantagepoint` | `manual` | `mock`), externalRef.
- **CaPhoto**: device-generated id, `filePath` (fixed at first write), caption,
  `takenAt`, optional `pinId`, `clientUpdatedAt`, and `reportId`: the report
  whose Capture step took it (fixed at first sync). Older photos have no
  `reportId` and stay available to every report.
- **CaPin**: drawingId, `x`/`y` as fractions (0–1) of the sheet, label, note,
  `deleted`. A pin's photos are the photos whose `pinId` points to it. The link
  is stored on the photo only.
- **CaDrawing**: the sheet image (`filePath`, `width`, `height`), original file
  name, PDF `page`/`pageCount`, source and externalRef, `isCurrent`
  (superseded sheets are kept).
- **CaDrawingSet**: the set's PDF (`filePath`), `pageCount`, `sheets` (number,
  name, how it was named), and for a synced set `source`, `externalRef`
  (the ccr version id), `revisionLabel`, `title`, `isCurrent` (as ccr says),
  `indexed` (false until a device has listed its sheets) and `syncedAt`.
- **CaReportContent.drawingSet**: the set a report was made with (`setId`,
  `revisionLabel`, `title`); printed on the report.
- **CaReport**: device-generated id, `reportNumber` (per project, "001"),
  `discipline` (`architecture` | `civil` | `mp` | `electrical` |
  `structural`, fixed when started; absent on older reports, listed as
  "Unassigned"), `createdBy` (UPN) and `createdByName` (display name), `draft`
  (CaReportContent), `draftUpdatedAt`, `latestRevision` (null until issued),
  `hasUnissuedChanges`.
- **CaReportRevision**: id `{reportId}_r{n}`, revision number (Rev 0 is the
  first issue), `dateIssued` (server clock), `issuedBy`, full `content`
  snapshot, frozen `photoPaths`, `contentHash`. Created once and never
  changed.

## 7. Open questions

Nothing in the code assumes an answer to these.

1. **ccr app role.** *Answered:* built in ccr (§5), and the role is granted to
   `Parkhill-Field-Reports`. ccr must be deployed with it, and its
   `document-control` Cosmos container created, before `ca-app` answers.
2. **Project identity.** *Answered:* ccr's key is `archProjectNumber`
   (e.g. `45371.25.01`), derived from the VantagePoint WBS number. *To verify:*
   the exact form of Fabric `WBS1`, so VantagePoint fallback numbers match.
3. **Drawing sets.** *Answered:* ccr's Document Control module, one PDF per
   version (§5). A project has one set at a time (no per-discipline sets).
4. **"Latest approved".** *Answered:* the highest version is current; ccr's
   `/latest` returns only that one, with `isLatestApproved: true`.
5. **Sheet metadata.** *Answered:* none; ccr stores the set as one PDF. Sheets
   are read from the title blocks here, as for an uploaded set.
6. **Write-back.** Should issued reports (PDF or data) be pushed back into the
   CA app, and if so, in what format?
7. **Retention and records policy** for issued revisions and their photos.
8. **Server-side PDF.** Is it required, and where would headless Chromium run?
9. **Drawing-set push.** *Built here (§5).* ccr calls it after a version is
   published, relabelled or deleted. *To do (admin):* the
   `FieldReports.DrawingSync` app role on Field Reports' app registration,
   assigned to ccr's managed identity, and the `CA_SYNC_*` /
   `FIELD_REPORTS_*` settings on both App Services.
10. **Sheet images on the server.** Sheets are rendered on the first device to
    open them. Rendering every sheet on the server at sync time would need
    PDF tooling there (e.g. a canvas package); not needed so far.
