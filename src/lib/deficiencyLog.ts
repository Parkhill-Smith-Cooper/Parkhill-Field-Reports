import type { SavedObservation } from "@/types";

/**
 * The Parkhill commissioning deficiency log: one row per field observation.
 * Shared by the Excel export (server) and the PDF export (browser) so the two
 * can never disagree about which column holds what.
 *
 * Priority and Responsible Party are deliberately left blank. They are the
 * engineer's call to make by hand after the export; nothing here, and nothing
 * AI-generated, fills them in. Status starts at Open.
 */

export const LOG_TITLE = "COMMISSIONING DEFICIENCY LOG";

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export const STATUSES = ["Open", "In Progress", "Ready for Retest", "Closed"] as const;
export const DEFAULT_STATUS = "Open";

/** Colours taken from the Parkhill template. */
export const LOG_COLORS = {
  titleBar: "9E2233",
  subtitleBar: "333333",
  rowBlue: "C5E4F3",
  rowGrey: "F2F2F2",
  rowRule: "3AA3D8",
  flagPink: "FCE4E4",
  flagYellow: "FFF2CC",
  flagGreen: "E2F0D9",
  flagRedText: "9E2233",
} as const;

export const LOG_COLUMNS = [
  { key: "id", header: "ID", width: 6 },
  { key: "date", header: "Date Identified", width: 15 },
  { key: "area", header: "Building / Area", width: 18 },
  { key: "equipment", header: "Room / Equipment", width: 24 },
  { key: "system", header: "System / Test", width: 30 },
  { key: "description", header: "Deficiency Description", width: 52 },
  { key: "priority", header: "Priority", width: 11 },
  { key: "status", header: "Status", width: 17 },
  { key: "responsible", header: "Responsible Party", width: 22 },
  { key: "checks", header: "Recommended Diagnostic Checks", width: 48 },
  { key: "actions", header: "Corrective Actions", width: 48 },
] as const;

export type LogColumnKey = (typeof LOG_COLUMNS)[number]["key"];

export type DeficiencyLogRow = {
  id: number;
  /** `yyyy-mm-dd` */
  date: string;
  area: string;
  equipment: string;
  system: string;
  description: string;
  priority: "";
  status: typeof DEFAULT_STATUS;
  responsible: "";
  checks: string;
  actions: string;
};

export function logSubtitle(projectNumber: string, projectName?: string): string {
  const project = projectName ? `${projectNumber} — ${projectName}` : projectNumber;
  return `${project} | Functional Performance Testing / Field Deficiencies`;
}

function numbered(items: { text: string }[]): string {
  return items.map((item, index) => `${index + 1}. ${item.text}`).join("\n");
}

/** Rows in the order the observations were made in the field. */
export function buildDeficiencyLogRows(
  observations: SavedObservation[],
): DeficiencyLogRow[] {
  return [...observations]
    .sort(
      (a, b) =>
        a.observedDate.localeCompare(b.observedDate) ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .map((observation, index) => ({
      id: index + 1,
      date: observation.observedDate,
      area: observation.location,
      equipment: observation.equipment,
      system: [observation.system, observation.activity]
        .filter((part) => part.trim().length > 0)
        .join(" / "),
      description: observation.observation,
      priority: "",
      status: DEFAULT_STATUS,
      responsible: "",
      checks: numbered(observation.causes),
      actions: numbered(observation.actions),
    }));
}

/** `yyyy-mm-dd` -> `m/d/yyyy`, matching the template's date column. */
export function formatLogDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${month}/${day}/${year}`;
}
