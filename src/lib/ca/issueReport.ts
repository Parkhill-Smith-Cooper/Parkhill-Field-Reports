import "server-only";

import { CaConflictError, isCaError, type CaRepository } from "@/lib/ca/contracts";
import type { CaReport, CaReportRevision } from "@/types/ca";

import { referencedPhotoIds } from "./reportContent";
import { buildRevision } from "./revisions";

/**
 * Issues a report: freezes the current draft as the next immutable revision
 * and stamps Date Issued on the server.
 *
 * Order matters. The revision is created first, with a create-only write, and
 * the report is marked afterwards. If marking fails (a dropped connection),
 * retrying finds the revision already there and, when it is the same content,
 * simply completes the mark. That makes "Issue" safe to retry without ever
 * creating a second, different Rev N.
 *
 * If the revision already there has DIFFERENT content (the draft was edited
 * between a failed mark and the retry, or another device issued first), that
 * revision is immutable and stays Rev N: the report's pointer is moved to it,
 * the newer draft is kept as "changes not issued", and the engineer is asked
 * to review and issue it as Rev N+1. The report is never left stuck.
 *
 * The mark carries the draft version the revision froze, so edits saved on
 * another device while issuing was in flight stay "changes not issued".
 */
export async function issueReport(input: {
  repo: CaRepository;
  projectNumber: string;
  reportId: string;
  issuedBy: string;
  now?: Date;
  /**
   * The `draftUpdatedAt` of the version the engineer reviewed. If the stored
   * draft is a different version (edited on another device, or this device's
   * latest edit has not synced), issuing is refused rather than freezing a
   * version nobody looked at.
   */
  expectedDraftUpdatedAt?: string;
}): Promise<{ report: CaReport; revision: CaReportRevision } | null> {
  const { repo, projectNumber, reportId, issuedBy } = input;

  const report = await repo.reports.get(projectNumber, reportId);
  if (!report) return null;

  if (input.expectedDraftUpdatedAt !== undefined && input.expectedDraftUpdatedAt !== report.draftUpdatedAt) {
    throw new CaConflictError(
      "This report has changed since you opened it (perhaps on another device). Review the latest version, then issue.",
    );
  }

  // Nothing changed since the last issue (e.g. a retried tap after success):
  // return that revision instead of creating an identical new one.
  if (report.latestRevision !== null && !report.hasUnissuedChanges) {
    const latest = await repo.reports.getRevision(projectNumber, reportId, report.latestRevision);
    if (latest) return { report, revision: latest };
  }

  const photos = await repo.photos.list(projectNumber);
  // A photo deleted after it was added to the draft must be taken out first,
  // rather than silently printing a photo someone deleted.
  const deletedIds = new Set(photos.filter((p) => p.deleted).map((p) => p.id));
  if (referencedPhotoIds(report.draft).some((id) => deletedIds.has(id))) {
    throw new CaConflictError(
      "A photo in this report has been deleted. Remove it from the report (it shows as \"Photo not available\"), then issue.",
    );
  }
  const photoPaths = Object.fromEntries(photos.filter((p) => !p.deleted).map((p) => [p.id, p.filePath]));

  const candidate = buildRevision({
    report,
    issuedBy,
    dateIssued: input.now ?? new Date(),
    photoPaths,
  });

  let revision: CaReportRevision;
  try {
    revision = await repo.reports.createRevision(candidate);
  } catch (error) {
    // By name, not instanceof - see the note on errors in contracts.ts.
    if (!isCaError(error, "RevisionAlreadyExistsError")) throw error;
    const existing = await repo.reports.getRevision(
      projectNumber,
      reportId,
      candidate.revision,
    );
    if (!existing) throw error;
    if (existing.contentHash !== candidate.contentHash) {
      // Rev N was issued with other content and is immutable. Point the
      // report at it (the draft stays "changes not issued" because it is not
      // the version Rev N froze), so the next Issue creates Rev N+1.
      await repo.reports.markIssued(projectNumber, reportId, existing.revision, existing.draftUpdatedAt);
      throw new CaConflictError(
        `Rev ${existing.revision} was already issued from an earlier version of this report. Your newer changes are kept; review them, then issue Rev ${existing.revision + 1}.`,
      );
    }
    // Same content: a retried issue whose mark step failed. Finish it,
    // against the draft version this attempt froze.
    revision = existing;
  }

  const marked = await repo.reports.markIssued(
    projectNumber,
    reportId,
    revision.revision,
    candidate.draftUpdatedAt,
  );
  return marked ? { report: marked, revision } : null;
}
