import "server-only";

import { CaConflictError, isCaError, type CaRepository } from "@/lib/ca/contracts";
import type { CaReport, CaReportRevision } from "@/types/ca";

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
  const photoPaths = Object.fromEntries(photos.map((p) => [p.id, p.filePath]));

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
    // Same content: a retried issue whose mark step failed. Finish it.
    // Different content: someone else issued first. Refuse; never overwrite.
    if (!existing || existing.contentHash !== candidate.contentHash) throw error;
    revision = existing;
  }

  const marked = await repo.reports.markIssued(
    projectNumber,
    reportId,
    revision.revision,
  );
  return marked ? { report: marked, revision } : null;
}
