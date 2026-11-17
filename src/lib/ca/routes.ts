import { CA_HOME } from "@/lib/navigation";

/** URL builders for CA screens, so links agree with the route tree by construction. */

export type CaProjectTab = "capture" | "reports" | "route";

export const CA_PROJECT_TABS: { key: CaProjectTab; label: string }[] = [
  { key: "capture", label: "Capture" },
  { key: "reports", label: "Reports" },
  { key: "route", label: "Site Route" },
];

export function caProjectPath(projectNumber: string, tab: CaProjectTab = "capture"): string {
  return `${CA_HOME}/${encodeURIComponent(projectNumber)}/${tab}`;
}

/*
 * Reports open INSIDE the Reports tab, addressed by query string
 * (`?report=…`, `&view=print`, `&rev=N`) rather than by route segments.
 *
 * Why: a report started offline has an id no server has seen. A route per
 * report would need its own page from the network; a query on the Reports tab
 * reuses the page (and code) already cached for offline use. In-app moves use
 * `history.pushState` (`caNavigate`), which Next.js syncs with
 * `useSearchParams` without a server round trip.
 */
export function caReportPath(projectNumber: string, reportId: string): string {
  return `${caProjectPath(projectNumber, "reports")}?report=${encodeURIComponent(reportId)}`;
}

/** The printable report: the draft, or an issued revision (`rev`). */
export function caReportPrintPath(projectNumber: string, reportId: string, revision?: number | null): string {
  const path = `${caReportPath(projectNumber, reportId)}&view=print`;
  return revision === undefined || revision === null ? path : `${path}&rev=${revision}`;
}

/** Same-page move that works offline (no server request). Browser Back still works. */
export function caNavigate(href: string): void {
  window.history.pushState(null, "", href);
  window.scrollTo({ top: 0 });
}
