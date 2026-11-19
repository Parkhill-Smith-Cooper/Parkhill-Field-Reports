import type { CaSpecSection } from "@/types/ca";

/**
 * Specification sections synced from the CA application's Document Control.
 * Shared by server and browser code; no Node APIs.
 *
 * A project's specifications are one PDF per CSI MasterFormat section, each
 * revised on its own. Field Reports keeps every revision it has synced and
 * shows the current one per section; the CA application says which that is.
 */

/** Section number, then newest revision first. */
export function bySectionRevision(a: CaSpecSection, b: CaSpecSection): number {
  if (a.sectionKey !== b.sectionKey) return a.sectionKey < b.sectionKey ? -1 : 1;
  return b.revision - a.revision;
}

/** The current revision of each section, by section number. */
export function currentSpecSections<T extends CaSpecSection>(sections: T[]): T[] {
  return sections.filter((s) => s.isCurrent).sort(bySectionRevision);
}

/** `2` → `"02"`, as spec logs print revisions. */
export const formatSpecRevision = (revision: number) => String(revision || 0).padStart(2, "0");

const digits = (value: string) => value.replace(/\D/g, "");

/** Matches a search on section number (with or without spaces) or title. */
export function specSectionMatches(section: Pick<CaSpecSection, "sectionNumber" | "sectionKey" | "title">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (section.title.toLowerCase().includes(q) || section.sectionNumber.toLowerCase().includes(q)) return true;
  const qDigits = digits(q);
  return qDigits.length >= 2 && digits(section.sectionKey).startsWith(qDigits);
}

/** MasterFormat 2018 division titles. Unknown divisions show their number only. */
const DIVISIONS: Record<string, string> = {
  "00": "Procurement and Contracting Requirements",
  "01": "General Requirements",
  "02": "Existing Conditions",
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood, Plastics, and Composites",
  "07": "Thermal and Moisture Protection",
  "08": "Openings",
  "09": "Finishes",
  "10": "Specialties",
  "11": "Equipment",
  "12": "Furnishings",
  "13": "Special Construction",
  "14": "Conveying Equipment",
  "21": "Fire Suppression",
  "22": "Plumbing",
  "23": "Heating, Ventilating, and Air Conditioning (HVAC)",
  "25": "Integrated Automation",
  "26": "Electrical",
  "27": "Communications",
  "28": "Electronic Safety and Security",
  "31": "Earthwork",
  "32": "Exterior Improvements",
  "33": "Utilities",
  "34": "Transportation",
  "35": "Waterway and Marine Construction",
  "40": "Process Interconnections",
  "41": "Material Processing and Handling Equipment",
  "42": "Process Heating, Cooling, and Drying Equipment",
  "43": "Process Gas and Liquid Handling, Purification, and Storage Equipment",
  "44": "Pollution and Waste Control Equipment",
  "45": "Industry-Specific Manufacturing Equipment",
  "46": "Water and Wastewater Equipment",
  "48": "Electrical Power Generation",
};

export function divisionLabel(division: string): string {
  return DIVISIONS[division] ? `Division ${division} — ${DIVISIONS[division]}` : `Division ${division}`;
}

/** Sections grouped by division, in division order. */
export function groupByDivision<T extends Pick<CaSpecSection, "division">>(sections: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const section of sections) {
    if (!groups.has(section.division)) groups.set(section.division, []);
    groups.get(section.division)!.push(section);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}
