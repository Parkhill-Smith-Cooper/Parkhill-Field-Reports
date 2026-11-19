/**
 * Which photos a report works with. Photos captured in a report's Capture
 * step carry its id; older photos (captured before reports had their own
 * steps) carry none and stay available to every report.
 */

type WithReport = { reportId?: string };

/** Photos captured for this report. */
export function photosOfReport<T extends WithReport>(photos: T[], reportId: string): T[] {
  return photos.filter((p) => p.reportId === reportId);
}

/**
 * Photos this report may pick from: its own, older photos that belong to no
 * report, and photos of a report that no longer exists. A photo's `reportId`
 * never changes, so a deleted draft's photos would otherwise be hidden from
 * every report although "its photos stay in the project".
 *
 * `knownReportIds` is the project's complete report list (server and this
 * device). Pass it only when that list is complete; without it, photos of
 * other reports are never offered.
 */
export function photosAvailableToReport<T extends WithReport>(
  photos: T[],
  reportId: string,
  knownReportIds?: ReadonlySet<string>,
): T[] {
  return photos.filter(
    (p) => !p.reportId || p.reportId === reportId || (knownReportIds !== undefined && !knownReportIds.has(p.reportId)),
  );
}
