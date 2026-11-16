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
