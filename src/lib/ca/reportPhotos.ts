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

/** Photos this report may use: its own, plus older photos that belong to no report. */
export function photosAvailableToReport<T extends WithReport>(photos: T[], reportId: string): T[] {
  return photos.filter((p) => !p.reportId || p.reportId === reportId);
}
