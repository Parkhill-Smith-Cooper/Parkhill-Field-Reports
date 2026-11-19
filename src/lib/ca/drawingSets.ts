import "server-only";

import { apiError } from "@/lib/apiResponse";
import { projectParam } from "@/lib/ca/apiRoute";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";
import type { CaDrawingSet } from "@/types/ca";

/** Shared by the drawing-set route handlers. */

export type DrawingSetParams = { params: Promise<{ projectNumber: string; setId: string }> };

/** The set as the browser gets it: with a short-lived URL to read the PDF. */
export async function withUrl(set: CaDrawingSet) {
  return { ...set, url: await getCaFileStore().readUrl(set.filePath) };
}

/** Project number and set id from the route, checked, with the project required to exist. */
export async function setParams(
  params: Promise<{ projectNumber: string; setId: string }>,
): Promise<{ projectNumber: string; setId: string } | { error: Response }> {
  const p = await projectParam(params);
  if ("error" in p) return p;
  const { setId } = await params;
  if (!isValidGeneratedId(setId)) return { error: apiError("Invalid drawing set id.", 400) };
  if (!(await getCaRepository().projects.get(p.projectNumber))) {
    return { error: apiError(`Project ${p.projectNumber} was not found.`, 404) };
  }
  return { projectNumber: p.projectNumber, setId };
}

/** A set that exists and has not been removed, or a 404 response. */
export async function liveSet(projectNumber: string, setId: string): Promise<CaDrawingSet | Response> {
  const set = await getCaRepository().drawingSets.get(projectNumber, setId);
  return set && !set.removed ? set : apiError("That drawing set was not found.", 404);
}
