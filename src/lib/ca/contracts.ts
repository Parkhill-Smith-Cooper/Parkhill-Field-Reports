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

export interface CaReportStore {
  list(projectNumber: string): Promise<CaReport[]>;
  get(projectNumber: string, reportId: string): Promise<CaReport | null>;
  /**
   * Creates the report, assigning the next per-project `reportNumber`.
   * Idempotent on `id`: a retried create returns the existing report.
   */
  create(
    report: Omit<CaReport, "reportNumber">,
  ): Promise<CaReport>;
  /** Replaces the draft. Marks `hasUnissuedChanges` once a revision exists. */
  saveDraft(
    projectNumber: string,
    reportId: string,
    content: CaReportContent,
  ): Promise<CaReport | null>;
  /**
   * Create-only. Throws `RevisionAlreadyExistsError` when `revision.id`
   * already exists. Never updates or deletes an existing revision.
   */
  createRevision(revision: CaReportRevision): Promise<CaReportRevision>;
  /** Records that `revision` is now the latest issued version. */
  markIssued(
    projectNumber: string,
    reportId: string,
    revision: number,
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
 * A drawing sheet as an upstream system describes it. How the CA application
 * decides which set is the latest *approved* one is not yet known - see
 * docs/ca-integration-contracts.md - so this contract carries the source's own
 * labels rather than inferring anything.
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
};

export interface CaDrawingSource {
  readonly kind: "mock" | "ca-app";
  listLatest(projectNumber: string): Promise<CaSourceDrawing[]>;
  fetchFile(
    projectNumber: string,
    externalRef: string,
  ): Promise<{ bytes: Uint8Array; contentType: string; fileName: string }>;
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
  | "MissingPhotoError";

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
