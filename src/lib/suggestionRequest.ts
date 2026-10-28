import "server-only";

import { isValidProjectNumber } from "@/lib/validation";
import type { SuggestionRequest } from "@/types";

/**
 * Photos sent to the model per request. Each costs tokens and upload time, and
 * past a handful they add little the engineer's own description does not.
 */
export const MAX_SUGGESTION_PHOTOS = 6;

/**
 * Parses the request body shared by both suggestion endpoints.
 *
 * Returns `null` when the body is unusable, so each route can answer 400 with
 * its own wording. Shared so the two endpoints cannot drift apart on what they
 * consider a valid request.
 */
export function readSuggestionRequest(body: unknown): SuggestionRequest | null {
  if (typeof body !== "object" || body === null) return null;

  const value = body as Record<string, unknown>;
  const text = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  const strings = (key: string) =>
    Array.isArray(value[key])
      ? (value[key] as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : undefined;

  // Equipment and the observation narrative are the two fields a suggestion is
  // meaningless without.
  if (text("equipment").trim().length === 0) return null;
  if (text("observation").trim().length === 0) return null;

  // The project number scopes which photos may be read, so it must be real.
  const projectNumber = text("projectNumber");
  if (!isValidProjectNumber(projectNumber)) return null;

  const photoPaths = strings("photoPaths") ?? [];
  if (photoPaths.some((path) => !isPathInProject(path, projectNumber))) {
    return null;
  }

  return {
    projectNumber,
    equipment: text("equipment"),
    system: text("system"),
    location: text("location"),
    activity: text("activity"),
    observation: text("observation"),
    observedDate: text("observedDate"),
    photoPaths: photoPaths.slice(0, MAX_SUGGESTION_PHOTOS),
    selectedCauses: strings("selectedCauses"),
  };
}

/**
 * The same rule as the photo-link route: without it these endpoints would read
 * any blob in the container and describe it back to the caller.
 */
function isPathInProject(path: string, projectNumber: string): boolean {
  return (
    path.startsWith(`${projectNumber}/`) &&
    !path.includes("..") &&
    !path.includes("//") &&
    path.endsWith(".jpg")
  );
}
