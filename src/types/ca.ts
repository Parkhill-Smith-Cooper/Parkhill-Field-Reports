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
  /** The uploaded drawing set this sheet was taken from (`page` is its page). */
  drawingSetId?: string;
  /** Superseded drawings stay so their pins remain meaningful. */
  isCurrent: boolean;
  uploadedAt: string;
  uploadedBy: string;
};

/** How a set sheet's number and name were set. Edited values are never overwritten. */
export type CaSheetNaming = "guess" | "ai" | "edited";

/** One page of an uploaded drawing set. */
export type CaSetSheet = {
  /** 1-based page in the PDF. */
  page: number;
  sheetNumber: string;
  sheetName: string;
  naming: CaSheetNaming;
};

/**
 * A full drawing-set PDF uploaded to the project, listed as its sheets for
 * engineers on any device to choose floor plans from. The PDF is stored once
 * in the CA file store; each sheet an engineer adds becomes a `CaDrawing`
 * (a rendered sheet image). Removing a set hides it; the file is kept, as
 * drawings made from it may still be traced back to it.
 */
export type CaDrawingSet = {
  id: string;
  projectNumber: string;
  fileName: string;
  /** Path of the PDF within the CA file store. */
  filePath: string;
  sizeBytes: number;
  pageCount: number;
  sheets: CaSetSheet[];
  uploadedAt: string;
  uploadedBy: string;
  /**
   * Where an imported set came from (absent for a PDF uploaded by hand), and
   * the source's id for that version, so it is offered as "Added" afterwards.
   */
  source?: "mock" | "ca-app";
  externalRef?: string;
  revisionLabel?: string;
  removed?: boolean;
  removedAt?: string;
  removedBy?: string;
};

/**
 * A field photo. Belongs to the project, not to a report: that is what lets an
 * engineer capture first and decide later which photos go into which report.
 * `id` is generated on the device, which is what makes offline sync idempotent.
 */
export type CaPhoto = {
  id: string;
  projectNumber: string;
  /**
   * The report the photo was captured for. Set on first sync and never
   * changed. Absent on photos captured before reports had their own steps.
   */
  reportId?: string;
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
  /**
   * Deleted by an engineer. A tombstone (the record and file are kept) so the
   * deletion syncs to every device and issued revisions keep their copy.
   */
  deleted?: boolean;
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
  /**
   * Zoom of each location page's floor-plan inset, by pin id. 1 shows the
   * whole sheet; higher values zoom in around the pin. Absent means 1.
   */
  locationZoom?: Record<string, number>;
};

/**
 * One "Photo Locations" section of a report: a pin, where it is on its
 * floor plan, and the report's photos taken there. Derived from the draft
 * and the project's pins and drawings; frozen into a revision at issue time.
 */
export type CaReportLocation = {
  pinId: string;
  /** The pin's name, e.g. "Mech room 110" or "Pin 3". */
  title: string;
  /** The sheet, e.g. "A-101 · First Floor Plan". */
  subtitle: string;
  /** The pin's floor plan, or null when it is not available. */
  drawing: { id: string; filePath: string; width: number; height: number } | null;
  /** Pin position as fractions (0-1) of the sheet. */
  x: number;
  y: number;
  /** In report order, with the captions used in the report. */
  photos: CaItemPhoto[];
};

/**
 * Parkhill disciplines. A project's reports are grouped by discipline, and
 * each discipline will later get its own variations of the report.
 */
export const CA_DISCIPLINES = ["architecture", "civil", "mp", "electrical", "structural"] as const;

export type CaDiscipline = (typeof CA_DISCIPLINES)[number];

export const CA_DISCIPLINE_LABELS: Record<CaDiscipline, string> = {
  architecture: "Architecture",
  civil: "Civil",
  mp: "MP",
  electrical: "Electrical",
  structural: "Structural",
};

export function isCaDiscipline(value: unknown): value is CaDiscipline {
  return typeof value === "string" && (CA_DISCIPLINES as readonly string[]).includes(value);
}

/**
 * A report and its working draft. Issued versions are separate, immutable
 * `CaReportRevision` records.
 */
export type CaReport = {
  id: string;
  projectNumber: string;
  /** Per-project sequence, zero-padded: "001". */
  reportNumber: string;
  /** Set when the report is started; never changed. Absent on older reports. */
  discipline?: CaDiscipline;
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
  /** The UPN of the engineer who started the report. */
  createdBy: string;
  /** Their display name, for lists. Absent on older reports. */
  createdByName?: string;
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
  /** The Photo Locations pages, frozen at issue time. Absent on older revisions. */
  locations?: CaReportLocation[];
  /**
   * The `draftUpdatedAt` of the draft this revision froze. Lets marking tell
   * whether the stored draft has moved on since (edits made after the issue
   * was started stay "changes not issued"). Absent on older revisions.
   */
  draftUpdatedAt?: string;
};

export type CaRevisionSummary = Pick<
  CaReportRevision,
  "id" | "revision" | "dateIssued" | "issuedBy"
>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** A report as a nav-bar search result. */
export type CaSearchReport = {
  id: string;
  projectNumber: string;
  projectName: string;
  reportNumber: string;
  discipline?: CaDiscipline;
  createdByName?: string;
  state: CaReportState;
  updatedAt: string;
};

export type CaSearchResult = { projects: CaProject[]; reports: CaSearchReport[] };
