/**
 * CA Field Reports — service contracts.
 *
 * These interfaces are the seams between the CA feature and the systems it
 * depends on. Route handlers only ever talk to these, so a real
 * implementation can replace a mock without any route or UI change.
 *
 * Implementations:
 *
 * | Contract          | Today                              | To be completed (Marcelo)            |
 * | ----------------- | ---------------------------------- | ------------------------------------ |
 * | CaRepository      | mock (memory + `.ca-dev-data/`)    | azure (Cosmos)                       |
 * | CaFileStore       | mock (local disk)                  | azure (Blob + user-delegation SAS)   |
 * | CaProjectSource   | mock, vantagepoint                 | ca-app (CA application API)          |
 * | CaDrawingSource   | mock                               | ca-app (CA application API)          |
 * | CaReportRenderer  | none (browser print-to-PDF)        | optional server-side PDF             |
 *
 * See docs/ca-integration-contracts.md for the full contract notes.
 */

import type {
  CaDrawing,
  CaDrawingSet,
  CaSetSheet,
  CaPhoto,
  CaPin,
  CaProject,
  CaReport,
  CaReportContent,
  CaReportRevision,
  CaSourceProject,
  NewCaProjectInput,
} from "@/types/ca";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface CaProjectStore {
  list(): Promise<CaProject[]>;
  get(projectNumber: string): Promise<CaProject | null>;
  /** Throws `CaConflictError` if the project number is already set up. */
  create(input: NewCaProjectInput, createdBy: string): Promise<CaProject>;
  update(
    projectNumber: string,
    patch: Partial<Pick<CaProject, "name" | "client">>,
  ): Promise<CaProject | null>;
  /** Removes the project and every CA record under it. Returns false if absent. */
  delete(projectNumber: string): Promise<boolean>;
}

export interface CaPhotoStore {
  list(projectNumber: string): Promise<CaPhoto[]>;
  get(projectNumber: string, photoId: string): Promise<CaPhoto | null>;
  /**
   * Idempotent on `photo.id`. A repeat with the same id never creates a second
   * record; caption and pin changes apply only if `clientUpdatedAt` is newer.
   */
  upsert(photo: CaPhoto): Promise<CaPhoto>;
}

export interface CaPinStore {
  list(projectNumber: string): Promise<CaPin[]>;
  /** Idempotent on `pin.id`; the newer `clientUpdatedAt` wins. */
  upsert(pin: CaPin): Promise<CaPin>;
}

export interface CaDrawingStore {
  list(projectNumber: string): Promise<CaDrawing[]>;
  get(projectNumber: string, drawingId: string): Promise<CaDrawing | null>;
  upsert(drawing: CaDrawing): Promise<CaDrawing>;
}

export interface CaDrawingSetStore {
  /** Every set of the project, removed ones included, oldest first. */
  list(projectNumber: string): Promise<CaDrawingSet[]>;
  get(projectNumber: string, setId: string): Promise<CaDrawingSet | null>;
  /** Create-only and idempotent on `id`: a retried create returns the stored set. */
  create(set: CaDrawingSet): Promise<CaDrawingSet>;
  /**
   * Replaces the sheets with `change(current)`, atomically: concurrent AI
   * results and engineer edits on other devices are never lost. Null if absent.
   */
  updateSheets(
    projectNumber: string,
    setId: string,
    change: (sheets: CaSetSheet[]) => CaSetSheet[],
  ): Promise<CaDrawingSet | null>;
  /** Hides the set (a tombstone; the file is kept). Null if absent. */
  remove(projectNumber: string, setId: string, removedBy: string): Promise<CaDrawingSet | null>;
}

export interface CaReportStore {
  list(projectNumber: string): Promise<CaReport[]>;
  /**
   * Reports in every project matching a normalized search (`reportMatches` in
   * src/lib/ca/search.ts), most recently active first, at most `limit`.
   */
  search(query: string, limit: number): Promise<CaReport[]>;
  get(projectNumber: string, reportId: string): Promise<CaReport | null>;
  /**
   * Creates the report, assigning the next per-project `reportNumber`.
   * Idempotent on `id`: a retried create returns the existing report.
   */
  create(
    report: Omit<CaReport, "reportNumber">,
  ): Promise<CaReport>;
  /**
   * Replaces the draft. Marks `hasUnissuedChanges` once a revision exists.
   * Ignored (returns the stored report) when a `clientUpdatedAt` is given and
   * is not newer than the stored `draftUpdatedAt`: a late, older edit never
   * wins. Without one (a server-side edit) the draft is always replaced.
   */
  saveDraft(
    projectNumber: string,
    reportId: string,
    content: CaReportContent,
    clientUpdatedAt?: string,
  ): Promise<CaReport | null>;
  /**
   * Deletes a report that has never been issued. Issued reports (and their
   * revisions) are never deleted.
   */
  deleteDraft(projectNumber: string, reportId: string): Promise<"deleted" | "issued" | "missing">;
  /**
   * Create-only. Throws `RevisionAlreadyExistsError` when `revision.id`
   * already exists. Never updates or deletes an existing revision.
   */
  createRevision(revision: CaReportRevision): Promise<CaReportRevision>;
  /**
   * Records that `revision` is now the latest issued version, atomically:
   * - `latestRevision` never moves backwards (a late, stale mark is ignored);
   * - `hasUnissuedChanges` stays true when the stored draft is no longer the
   *   version the revision froze (`issuedDraftUpdatedAt`), so edits saved
   *   while the issue was in flight are not mistaken for issued ones.
   */
  markIssued(
    projectNumber: string,
    reportId: string,
    revision: number,
    issuedDraftUpdatedAt: string | undefined,
  ): Promise<CaReport | null>;
  listRevisions(
    projectNumber: string,
    reportId: string,
  ): Promise<CaReportRevision[]>;
  getRevision(
    projectNumber: string,
    reportId: string,
    revision: number,
  ): Promise<CaReportRevision | null>;
}

export interface CaRepository {
  readonly kind: "mock" | "azure";
  projects: CaProjectStore;
  photos: CaPhotoStore;
  pins: CaPinStore;
  drawings: CaDrawingStore;
  drawingSets: CaDrawingSetStore;
  reports: CaReportStore;
}

// ---------------------------------------------------------------------------
// Files (photos and drawings)
// ---------------------------------------------------------------------------

export interface CaFileStore {
  readonly kind: "mock" | "azure";
  /** Files are immutable: writing an existing path with new bytes is refused. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  get(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  /** A URL the signed-in browser can read the file from, valid for minutes. */
  readUrl(path: string): Promise<string>;
  /**
   * Large files (drawing-set PDFs) arrive in numbered blocks. A staged block
   * is invisible until `commitBlocks`; staging the same block again replaces
   * it. Does nothing once the file exists.
   */
  stageBlock(path: string, index: number, bytes: Uint8Array): Promise<void>;
  /**
   * Joins blocks `0..blockCount-1` into the file. Create-only, like `put`:
   * if the file already exists it is left as it is. Returns the file size.
   * Throws `MissingBlockError` when a block was never staged.
   */
  commitBlocks(path: string, blockCount: number, contentType: string): Promise<{ sizeBytes: number }>;
}

// ---------------------------------------------------------------------------
// Upstream systems
// ---------------------------------------------------------------------------

/** Projects available to set up in CA Field Reports. */
export interface CaProjectSource {
  readonly kind: CaSourceProject["source"];
  list(): Promise<CaSourceProject[]>;
}

/**
 * A drawing as an upstream system describes it: one sheet (an image) or a
 * whole drawing set (a PDF, imported as a drawing set whose pages are listed
 * as sheets). The source says which set is the latest approved one; nothing
 * here infers it. See docs/ca-integration-contracts.md.
 */
export type CaSourceDrawing = {
  externalRef: string;
  title: string;
  sheetNumber?: string;
  revisionLabel?: string;
  /** As stated by the source system; never inferred from a file name. */
  isLatestApproved: boolean;
  fileType: "pdf" | "image";
  fileName: string;
  /** File size, when the source states it. */
  sizeBytes?: number;
};

export interface CaDrawingSource {
  readonly kind: "mock" | "ca-app";
  listLatest(projectNumber: string): Promise<CaSourceDrawing[]>;
  /** A stream, so a large drawing set is passed through without being held in memory. */
  fetchFile(
    projectNumber: string,
    externalRef: string,
  ): Promise<{ bytes: Uint8Array | ReadableStream<Uint8Array>; contentType: string; fileName: string }>;
}

/** Optional future server-side PDF generation for issued revisions. */
export interface CaReportRenderer {
  renderPdf(revision: CaReportRevision): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Errors shared by every implementation
//
// Always test these with `isCaError(error, "Name")`, never `instanceof`.
// Implementations are cached on `globalThis` (so dev hot reload keeps the mock
// store), and Next compiles each route into its own bundle with its own copy
// of these classes - so an error thrown by a cached repository is not an
// `instanceof` the class a different route imported. The name survives.
// ---------------------------------------------------------------------------

export type CaErrorName =
  | "CaConflictError"
  | "CaNotConfiguredError"
  | "RevisionAlreadyExistsError"
  | "MissingPhotoError"
  | "MissingBlockError";

export function isCaError(error: unknown, name: CaErrorName): error is Error {
  return error instanceof Error && error.name === name;
}

export class CaConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaConflictError";
  }
}

export class CaNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaNotConfiguredError";
  }
}

/** A drawing-set upload was committed before all of its blocks arrived. */
export class MissingBlockError extends Error {
  constructor(message = "Part of the upload is missing. Upload the drawing set again.") {
    super(message);
    this.name = "MissingBlockError";
  }
}
