# CA Field Reports — integration contracts

For the backend owner who will connect CA Field Reports to Parkhill systems.
It covers every seam between the CA feature and the outside world, what runs
today, and what must be confirmed or built before production.

The rule throughout: **nothing here guesses.** Where a fact about the CA
application (parkhill-ccr), its drawings or its API was not known, the code
has a stub that fails with a clear "not connected yet" message, and the
question is listed under [Open questions](#open-questions).

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
| `CaProjectSource` | 3 labelled sample projects | `vantagepoint` (reuses CX lookup) works; `ca-app` is a stub | Needs the CA app API |
| `CaDrawingSource` | 2 labelled sample SVG sheets | `ca-app` is a stub | Needs the CA app API and the drawing rules below |
| `CaReportRenderer` | — (browser print-to-PDF) | not built | Optional future |

## 2. Configuration

All blank placeholders are in `.env.example`. No CA setting is a secret.

| Variable | Values | Default |
| --- | --- | --- |
| `CA_DATA_MODE` | `mock` \| `azure` | `mock` in development; **required in production** (startup error if unset) |
| `CA_PROJECT_SOURCE` | `mock` \| `vantagepoint` \| `ca-app` \| `none` | `mock` in mock mode, else `none` (manual entry only) |
| `CA_DRAWING_SOURCE` | `mock` \| `ca-app` \| `none` | `mock` in mock mode, else `none` (upload only) |
| `CA_APP_API_BASE_URL` | URL | required only when a source is `ca-app` |
| `CA_APP_API_SCOPE` | Entra scope, e.g. `api://…/.default` | required only when a source is `ca-app` |
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
| `caDrawings` | `drawing` | Low volume |
| `caReports` | `report`, `revision` (id `{reportId}_r{n}`), `counter` (id `reportCounter`) | Revisions are create-only |

Blob: one private container, `ca-files`, in the existing storage account.

| Path | Content |
| --- | --- |
| `{projectNumber}/photos/{photoId}.jpg` | Photos (downscaled on the device, ≤ 8 MB) |
| `{projectNumber}/drawings/{drawingId}.{png\|jpg\|webp}` | Drawing sheet images (≤ 25 MB) |

### Roles and settings

- The app identity already has Cosmos Built-in Data Contributor and Storage
  Blob Data Contributor + Storage Blob Delegator for CX. Confirm they cover
  the new containers. They do if they were granted at account scope.
- **Blob CORS:** allow `GET` from the app's origin on the storage account. The
  browser downloads drawing sheets with `fetch`, from short-lived SAS URLs, to
  keep them for offline use. Photos shown in `<img>` do not need CORS.
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
| `GET /api/ca/source-projects` | Projects offered by `CaProjectSource`, not yet set up |
| `GET /api/ca/projects/{p}/photos` | Photos with read URLs |
| `PUT /api/ca/projects/{p}/photos/{photoId}` | Idempotent multipart upload: `meta` (JSON) + `file` (JPEG, first time only). Newer `clientUpdatedAt` wins |
| `GET /api/ca/projects/{p}/pins`, `PUT …/pins/{pinId}` | Pins. Deletion is `deleted: true`. Newer edit wins |
| `GET /api/ca/projects/{p}/drawings`, `PUT/PATCH …/drawings/{drawingId}` | Drawing sheets. PUT is multipart: `meta` + sheet **image**. PATCH renames or marks superseded |
| `GET /api/ca/projects/{p}/source-drawings[?ref=…]` | Sheets offered by `CaDrawingSource`, or one sheet's file |
| `GET /api/ca/projects/{p}/reports` | Reports |
| `GET/PUT/DELETE /api/ca/projects/{p}/reports/{id}` | Report and its revision list / idempotent create-or-save draft (`{draft, clientUpdatedAt, createdAt}`) / delete a never-issued draft |
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

## 5. Upstream sources to implement

### `CaProjectSource` (`ca-app`): `src/repositories/ca/sources.ts`

```ts
interface CaProjectSource {
  kind: "ca-app";
  list(): Promise<{ projectNumber; name; client?; source: "ca-app"; externalRef? }[]>;
}
```

Return the projects CA should be able to set up. `projectNumber` becomes the
document id, the partition key and a file-path segment, so it must pass
`isValidProjectNumber` (letters, numbers, `.`, `-`, `_`). Call the CA app with
an Entra app-to-app token for `CA_APP_API_SCOPE`, using the existing
`DefaultAzureCredential`. On failure, throw `CaNotConfiguredError` with a
message an engineer can act on. The UI then offers manual entry.

### `CaDrawingSource` (`ca-app`): same file

```ts
interface CaDrawingSource {
  kind: "ca-app";
  listLatest(projectNumber): Promise<CaSourceDrawing[]>;   // the sheets to offer
  fetchFile(projectNumber, externalRef): Promise<{ bytes; contentType; fileName }>;
}
type CaSourceDrawing = { externalRef; title; sheetNumber?; revisionLabel?;
                         isLatestApproved: boolean; fileType: "pdf" | "image"; fileName };
```

- `isLatestApproved` and `revisionLabel` must come **from the CA app**. The app
  shows them as given and never infers "latest approved" from a file name or
  folder.
- `fetchFile` may return a **multi-page PDF**. The browser opens it with
  pdf.js, the engineer picks the floor-plan page, and the device uploads that
  page as an image. The server needs no PDF tooling.
- The browser downloads the file through `/api/ca/projects/{p}/source-drawings?ref=…`,
  which only serves refs that `listLatest` returned for that project.

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
  `takenAt`, optional `pinId`, `clientUpdatedAt`. Photos belong to the
  **project**, not a report. That is what allows capture first and reports
  later.
- **CaPin**: drawingId, `x`/`y` as fractions (0–1) of the sheet, label, note,
  `deleted`. A pin's photos are the photos whose `pinId` points to it. The link
  is stored on the photo only.
- **CaDrawing**: the sheet image (`filePath`, `width`, `height`), original file
  name, PDF `page`/`pageCount`, source and externalRef, `isCurrent`
  (superseded sheets are kept).
- **CaReport**: device-generated id, `reportNumber` (per project, "001"),
  `draft` (CaReportContent), `draftUpdatedAt`, `latestRevision` (null until
  issued), `hasUnissuedChanges`.
- **CaReportRevision**: id `{reportId}_r{n}`, revision number (Rev 0 is the
  first issue), `dateIssued` (server clock), `issuedBy`, full `content`
  snapshot, frozen `photoPaths`, `contentHash`. Created once and never
  changed.

## 7. Open questions

These must be confirmed with the CA application owner before connecting
`ca-app`. Nothing in the code assumes an answer.

1. **API surface and auth** for parkhill-ccr: base URL, endpoints, and whether
   app-to-app Entra auth (client credentials) is supported, with which scope.
2. **Project identity.** Is the CA app's project key the VantagePoint WBS1 /
   project number used by CX, or something else that needs mapping?
3. **Drawing sets.** Where do the files physically live (SharePoint, Blob, the
   CA app's own store)? How is a set organised (per discipline, per sheet)?
4. **"Latest approved".** How does the CA app decide which drawing set or
   revision is current and approved: a status flag, an approval record, a
   naming convention such as "100% CD", or a folder? The UI expects the
   source to say so explicitly.
5. **Sheet metadata.** Does the CA app expose sheet numbers and titles, or
   only file names?
6. **Write-back.** Should issued reports (PDF or data) be pushed back into the
   CA app, and if so, in what format?
7. **Retention and records policy** for issued revisions and their photos.
8. **Server-side PDF.** Is it required, and where would headless Chromium run?
