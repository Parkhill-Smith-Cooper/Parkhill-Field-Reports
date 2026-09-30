/**
 * Formats a `yyyy-mm-dd` observation date for display.
 *
 * Parsed as explicit local components rather than through `new Date(string)`:
 * `new Date("2026-09-02")` is interpreted as UTC midnight, which renders as
 * the *previous* day in every US timezone. On a dated engineering record that
 * is not a cosmetic bug.
 */
export function formatReportDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
