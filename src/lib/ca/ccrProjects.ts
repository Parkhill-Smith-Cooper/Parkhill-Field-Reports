import { isValidProjectNumber } from "@/lib/validation";
import type { CaSourceProject } from "@/types/ca";

/**
 * Mapping from the CA application (parkhill-ccr backend) to CA project
 * offers. Kept free of I/O so it can be tested with recorded samples.
 *
 * `GET /api/projects` returns the ccr Cosmos project documents. The fields
 * used here (see parkhill-ccr `backend/routes/projects.js`):
 *
 * - `id`                 ccr's record id, kept as `externalRef`
 * - `archProjectNumber`  e.g. "45371.25.01"; ccr's partition key and URL id
 * - `name`
 * - `archived`           archived projects are not offered
 *
 * ccr has no client field, so `client` is left empty for the engineer to fill.
 */
export type CcrProject = {
  id?: unknown;
  archProjectNumber?: unknown;
  name?: unknown;
  archived?: unknown;
};

export function mapCcrProjects(body: unknown): CaSourceProject[] {
  if (!Array.isArray(body)) {
    throw new Error("The CA application returned an unexpected project list.");
  }
  const seen = new Set<string>();
  const offers: CaSourceProject[] = [];
  for (const raw of body as CcrProject[]) {
    if (!raw || typeof raw !== "object" || raw.archived === true) continue;
    const projectNumber = typeof raw.archProjectNumber === "string" ? raw.archProjectNumber.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!isValidProjectNumber(projectNumber) || !name || seen.has(projectNumber)) continue;
    seen.add(projectNumber);
    offers.push({
      projectNumber,
      name: name.slice(0, 200),
      client: "",
      source: "ca-app",
      ...(typeof raw.id === "string" && raw.id ? { externalRef: raw.id } : {}),
    });
  }
  return offers.sort((a, b) => a.projectNumber.localeCompare(b.projectNumber));
}

/**
 * The CA application's project number for a VantagePoint WBS1, using the same
 * rule as parkhill-ccr (`frontend/src/components/ProjectForm.tsx`): strip
 * leading zeros, put a dot before the last two digits of the first group, and
 * drop a trailing ".00". "4537125.01" → "45371.25.01".
 *
 * Used so a project picked from VantagePoint (when the CA app is unreachable)
 * gets the same number it has in the CA app. Only a WBS number with a single
 * dot ("4537125.01") is converted; anything else, including a number already
 * in "45371.25.01" form, is returned unchanged.
 */
export function archProjectNumberFromWbs(wbs1: string): string {
  const trimmed = wbs1.trim();
  if (!/^\d+\.\d+$/.test(trimmed)) return trimmed;
  const converted = trimmed
    .replace(/^0+/, "")
    .replace(/(\d+)(\d{2})\.(\d+)/, "$1.$2.$3")
    .replace(/\.00$/, "");
  return isValidProjectNumber(converted) ? converted : trimmed;
}
