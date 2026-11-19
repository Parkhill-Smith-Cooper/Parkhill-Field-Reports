import type { CaReport } from "@/types/ca";

/** Search terms: 2 to 100 characters after trimming. */
export const CA_SEARCH_MIN = 2;
export const CA_SEARCH_MAX = 100;
export const CA_SEARCH_LIMIT = 20;

export function normalizeSearch(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().toLowerCase();
  return q.length >= CA_SEARCH_MIN && q.length <= CA_SEARCH_MAX ? q : null;
}

const has = (value: string | undefined, q: string) => Boolean(value && value.toLowerCase().includes(q));

/**
 * Whether a report matches a (normalized) search: its number, project, who
 * started it, its discipline, or the project name on the report. Every
 * repository applies this same rule, so search behaves the same everywhere.
 */
export function reportMatches(report: CaReport, q: string): boolean {
  return (
    has(report.reportNumber, q) ||
    has(report.projectNumber, q) ||
    has(report.createdByName, q) ||
    has(report.createdBy, q) ||
    has(report.discipline, q) ||
    has(report.draft.projectName, q)
  );
}

/** Newest activity first. */
export const byRecentActivity = (a: CaReport, b: CaReport) => b.updatedAt.localeCompare(a.updatedAt);
