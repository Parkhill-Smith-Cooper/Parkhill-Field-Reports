/**
 * Construction Administration (CA) Field Reports — shared contract.
 *
 * Kept apart from `src/types/index.ts` (the CX contract) so the two
 * experiences stay separate: nothing in CX imports from here, and nothing here
 * changes a CX shape. Everything that crosses the network boundary for CA is
 * described in this file exactly once.
 *
 * Every CA record is partitioned by `projectNumber`, mirroring the CX
 * convention (see "How the data is stored" in the README).
 */

/** Where a CA project record came from. `mock` is never real data. */
export type CaProjectSourceKind = "ca-app" | "vantagepoint" | "manual" | "mock";

export type CaProject = {
  /** Equal to `projectNumber`, as in CX: point reads and DB-enforced uniqueness. */
  id: string;
  projectNumber: string;
  name: string;
  /** The report's "To" line, e.g. the owner. Optional; reports can override it. */
  client: string;
  source: CaProjectSourceKind;
  /** The project's id in the system it came from, when that differs. */
  externalRef?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

/** A project offered by a `CaProjectSource` that is not yet set up here. */
export type CaSourceProject = {
  projectNumber: string;
  name: string;
  client?: string;
  source: Exclude<CaProjectSourceKind, "manual">;
  externalRef?: string;
};

export type NewCaProjectInput = {
  projectNumber: string;
  name: string;
  client?: string;
  source: CaProjectSourceKind;
  externalRef?: string;
};

// ---------------------------------------------------------------------------
// Drawings, photos and pins (the capture side)
// ---------------------------------------------------------------------------

export type CaDrawingFileType = "pdf" | "image";

export type CaDrawing = {
  id: string;
  projectNumber: string;
  title: string;
  sheetNumber?: string;
  /** As labelled by the source, e.g. "100% CD" or "Rev 3". Never inferred. */
  revisionLabel?: string;
  /** What the engineer supplied: a PDF (one page used) or an image. */
  fileType: CaDrawingFileType;
  /** For PDFs, the page used as the floor plan (1-based). 1 for images. */
  page: number;
  pageCount: number;
  /** The file the engineer uploaded or imported, for traceability. */
  originalFileName: string;
  /**
   * Path within the CA file store of the sheet IMAGE the app displays and pins
   * against (PNG/JPEG/WebP). PDFs are rendered to an image on the device at
   * upload time, so phones never parse a PDF in the field and the sheet works
   * offline like any photo.
   */
  filePath: string;
  /** Pixel size of the sheet image; pins are fractions of it. */
  width: number;
  height: number;
  source: "upload" | "ca-app" | "mock";
  externalRef?: string;
  /** Superseded drawings stay so their pins remain meaningful. */
  isCurrent: boolean;
  uploadedAt: string;
  uploadedBy: string;
};

/**
 * A field photo. Belongs to the project, not to a report: that is what lets an
 * engineer capture first and decide later which photos go into which report.
 * `id` is generated on the device, which is what makes offline sync idempotent.
 */
export type CaPhoto = {
  id: string;
  projectNumber: string;
  /** Path within the CA file store. */
  filePath: string;
  fileName: string;
  caption: string;
  /** When the photo was taken (device clock), ISO 8601. */
  takenAt: string;
  pinId?: string;
  width?: number;
  height?: number;
  createdBy: string;
  createdAt: string;
  /** Device-side edit time; the newer edit wins on sync. */
  clientUpdatedAt: string;
};

/**
 * A photo-location pin on a drawing. `x` and `y` are fractions (0-1) of the
 * rendered sheet, so a pin stays put at any zoom level or render resolution.
 *
 * A pin's photos are the photos whose `pinId` is this pin's id. The link is
 * stored on the photo only, so it can never disagree with itself when the
 * photo and the pin sync separately.
 */
export type CaPin = {
  id: string;
  projectNumber: string;
  drawingId: string;
  x: number;
  y: number;
  label: string;
  note: string;
  createdAt: string;
  createdBy: string;
  clientUpdatedAt: string;
  deleted?: boolean;
};

// ---------------------------------------------------------------------------
// Field Observation Report
// ---------------------------------------------------------------------------

export const CA_ITEM_STATUSES = [
  "in-progress",
  "complete",
  "deficient",
  "corrected",
] as const;

export type CaItemStatus = (typeof CA_ITEM_STATUSES)[number];

export type CaItemPhoto = {
  photoId: string;
  /** The caption as it appears in this report; defaults from the photo. */
  caption: string;
};

export type CaReportItem = {
  id: string;
  status: CaItemStatus;
  description: string;
  photos: CaItemPhoto[];
  /** The pin this item was started from, if any. Informational. */
  pinId?: string;
};

export type CaWeather = {
  clear: boolean;
  overcast: boolean;
  rain: boolean;
  snow: boolean;
  foggy: boolean;
  cold: boolean;
};

export type CaSiteConditions = {
  clear: boolean;
  dusty: boolean;
  muddy: boolean;
  /** Free text; a non-empty value renders as "Other: …". */
  other: string;
};

export type CaPerson = {
  name: string;
  company: string;
  email: string;
};

export type CaDistribution = {
  owner: boolean;
  parkhill: boolean;
  contractor: boolean;
};

/** The body of a Field Observation Report, field-for-field with the template. */
export type CaReportContent = {
  to: string;
  from: string;
  projectName: string;
  projectNo: string;
  /** `yyyy-mm-dd`. Shown as "Date Visited". */
  dateVisited: string;
  /** `HH:mm`, 24-hour. */
  timeVisited: string;
  percentComplete: string;
  coverPhotoId?: string;
  weather: CaWeather;
  temperature: string;
  site: CaSiteConditions;
  persons: CaPerson[];
  materialsStored: string;
  clientActionItems: string;
  workSummary: string;
  items: CaReportItem[];
  comments: string;
  distribution: CaDistribution;
};

/**
 * A report and its working draft. Issued versions are separate, immutable
 * `CaReportRevision` records.
 */
export type CaReport = {
  id: string;
  projectNumber: string;
  /** Per-project sequence, zero-padded: "001". */
  reportNumber: string;
  draft: CaReportContent;
  /** `null` until first issued. Rev 0 is the first issue. */
  latestRevision: number | null;
  /** True when the draft has been edited since `latestRevision` was issued. */
  hasUnissuedChanges: boolean;
  /**
   * Device time of the draft edit now stored. A sync carrying an older edit is
   * ignored (newer edit wins), and Issue checks it so a report is only issued
   * from the version the engineer actually reviewed.
   */
  draftUpdatedAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export type CaReportState = "draft" | "issued" | "revising";

/**
 * An issued version. Created once, never updated or deleted. It carries a
 * full snapshot (captions included) and the file paths of every photo, so
 * later edits to the draft, a photo caption or a pin cannot change it.
 */
export type CaReportRevision = {
  id: string;
  projectNumber: string;
  reportId: string;
  reportNumber: string;
  revision: number;
  /** ISO 8601, stamped by the server at issue time. */
  dateIssued: string;
  issuedBy: string;
  content: CaReportContent;
  /** photoId → file path, frozen at issue time. */
  photoPaths: Record<string, string>;
  contentHash: string;
};

export type CaRevisionSummary = Pick<
  CaReportRevision,
  "id" | "revision" | "dateIssued" | "issuedBy"
>;
