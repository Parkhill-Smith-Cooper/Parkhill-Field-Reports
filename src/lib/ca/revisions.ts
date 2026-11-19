import "server-only";

import { createHash } from "node:crypto";

import type {
  CaReport,
  CaReportLocation,
  CaReportRevision,
  CaRevisionSummary,
} from "@/types/ca";

import { referencedPhotoIds } from "./reportContent";

/**
 * Revision scheme for issued reports.
 *
 * - The first issue is **Rev 0**, and each re-issue is the next integer.
 * - A revision is a full, frozen snapshot: the content (captions included)
 *   and the file path of every photo it shows. It is written once and never
 *   updated or deleted, so a previously issued PDF can always be reproduced
 *   exactly.
 * - The revision id is deterministic (`{reportId}_r{n}`). Storage writes it
 *   with a create-only operation, so two concurrent "Issue" taps cannot
 *   produce two different Rev N records: the second create fails.
 */

export class RevisionAlreadyExistsError extends Error {
  constructor(reportId: string, revision: number) {
    super(`Revision ${revision} of report ${reportId} has already been issued.`);
    this.name = "RevisionAlreadyExistsError";
  }
}

export class MissingPhotoError extends Error {
  constructor(photoId: string) {
    super(
      `Photo ${photoId} has not finished uploading. Sync this device, then issue again.`,
    );
    this.name = "MissingPhotoError";
  }
}

export function nextRevisionNumber(latest: number | null): number {
  return latest === null ? 0 : latest + 1;
}

/**
 * The report after recording `revision` as issued, or `null` when the mark
 * would change nothing (a stale or repeated mark). Shared by every
 * repository so the rule is applied inside each one's atomic update:
 * - `latestRevision` never moves backwards;
 * - the draft stays "changes not issued" unless it is still exactly the
 *   version the revision froze. A missing `issuedDraftUpdatedAt` (an older
 *   revision) is treated as "cannot prove it matches", so stays dirty.
 */
export function applyIssueMark(
  report: CaReport,
  revision: number,
  issuedDraftUpdatedAt: string | undefined,
  updatedAt: string,
): CaReport | null {
  if (report.latestRevision !== null && revision < report.latestRevision) return null;
  const hasUnissuedChanges =
    issuedDraftUpdatedAt === undefined || report.draftUpdatedAt !== issuedDraftUpdatedAt;
  if (report.latestRevision === revision && report.hasUnissuedChanges === hasUnissuedChanges) return null;
  return { ...report, latestRevision: revision, hasUnissuedChanges, updatedAt };
}

export function revisionId(reportId: string, revision: number): string {
  return `${reportId}_r${revision}`;
}

export function buildRevision(input: {
  report: CaReport;
  issuedBy: string;
  dateIssued: Date;
  /** photoId → file path, for photos that exist in storage. */
  photoPaths: Record<string, string>;
  /** The Photo Locations pages to freeze (see `buildReportLocations`). */
  locations?: CaReportLocation[];
}): CaReportRevision {
  const { report, issuedBy, dateIssued } = input;
  const revision = nextRevisionNumber(report.latestRevision);

  const frozenPaths: Record<string, string> = {};
  for (const photoId of referencedPhotoIds(report.draft)) {
    const path = input.photoPaths[photoId];
    // Issuing with a photo that so far exists only on a phone would produce a
    // PDF with a permanent hole in it. Refuse instead.
    if (!path) throw new MissingPhotoError(photoId);
    frozenPaths[photoId] = path;
  }

  // A deep copy, so the stored snapshot shares nothing with the live draft.
  const content = structuredClone(report.draft);
  const locations = input.locations?.length ? structuredClone(input.locations) : undefined;

  return {
    id: revisionId(report.id, revision),
    projectNumber: report.projectNumber,
    reportId: report.id,
    reportNumber: report.reportNumber,
    revision,
    dateIssued: dateIssued.toISOString(),
    issuedBy,
    content,
    photoPaths: frozenPaths,
    ...(locations && { locations }),
    // Locations join the hash only when present, so revisions issued before
    // location pages existed keep the hash they were issued with.
    contentHash: contentHash(locations ? { content, photoPaths: frozenPaths, locations } : { content, photoPaths: frozenPaths }),
    draftUpdatedAt: report.draftUpdatedAt,
  };
}

export function toSummary(revision: CaReportRevision): CaRevisionSummary {
  return {
    id: revision.id,
    revision: revision.revision,
    dateIssued: revision.dateIssued,
    issuedBy: revision.issuedBy,
  };
}

/** SHA-256 over a key-order-independent serialisation. */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}
