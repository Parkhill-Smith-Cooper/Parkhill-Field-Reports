import type {
  CaProject,
  CaReport,
  CaReportContent,
  CaReportState,
} from "@/types/ca";

/**
 * Builders and derived values for report content. Pure, so the same rules
 * apply in the browser (offline drafts) and on the server.
 */

export function emptyReportContent(
  project: Pick<CaProject, "name" | "projectNumber" | "client">,
  fromName: string,
  now: Date = new Date(),
): CaReportContent {
  return {
    to: project.client ?? "",
    from: fromName ? `Parkhill — ${fromName}` : "Parkhill",
    projectName: project.name,
    projectNo: project.projectNumber,
    dateVisited: toIsoDate(now),
    timeVisited: toTime(now),
    percentComplete: "",
    weather: {
      clear: false,
      overcast: false,
      rain: false,
      snow: false,
      foggy: false,
      cold: false,
    },
    temperature: "",
    site: { clear: false, dusty: false, muddy: false, other: "" },
    persons: [],
    materialsStored: "",
    clientActionItems: "",
    workSummary: "",
    items: [],
    comments: "",
    distribution: { owner: true, parkhill: true, contractor: true },
  };
}

export function reportState(
  report: Pick<CaReport, "latestRevision" | "hasUnissuedChanges">,
): CaReportState {
  if (report.latestRevision === null) return "draft";
  return report.hasUnissuedChanges ? "revising" : "issued";
}

/** Every photo id the content refers to, cover photo first. */
export function referencedPhotoIds(content: CaReportContent): string[] {
  const ids = new Set<string>();
  if (content.coverPhotoId) ids.add(content.coverPhotoId);
  for (const item of content.items) {
    for (const photo of item.photos) ids.add(photo.photoId);
  }
  return [...ids];
}

/** Item numbers are positional and zero-padded, as in the template ("001"). */
export function itemNumber(index: number): string {
  return String(index + 1).padStart(3, "0");
}

export function formatReportNumber(sequence: number): string {
  return String(sequence).padStart(3, "0");
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
