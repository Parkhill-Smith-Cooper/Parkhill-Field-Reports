import "server-only";

import type { SuggestionRequest } from "@/types";

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

  // Equipment and the observation narrative are the two fields a suggestion is
  // meaningless without.
  if (text("equipment").trim().length === 0) return null;
  if (text("observation").trim().length === 0) return null;

  return {
    projectNumber: text("projectNumber"),
    equipment: text("equipment"),
    system: text("system"),
    location: text("location"),
    activity: text("activity"),
    observation: text("observation"),
    observedDate: text("observedDate"),
    selectedCauses: Array.isArray(value.selectedCauses)
      ? (value.selectedCauses as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
  };
}
