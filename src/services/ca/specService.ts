"use client";

import { apiGet, apiPost } from "@/services/apiClient";
import type { CaSpecSection } from "@/types/ca";

const base = (projectNumber: string) => `/api/ca/projects/${encodeURIComponent(projectNumber)}/specifications`;

/**
 * The project's specification sections (current revision of each). `syncing`
 * is true while the server is still copying from the CA application; ask
 * again shortly. `hasSource` is false when no Document Control is connected.
 */
export async function fetchSpecSections(
  projectNumber: string,
): Promise<{ sections: CaSpecSection[]; syncing: boolean; hasSource: boolean }> {
  const result = await apiGet<{ sections: CaSpecSection[]; syncing?: boolean; hasSource?: boolean }>(base(projectNumber));
  return { sections: result.sections, syncing: result.syncing === true, hasSource: result.hasSource !== false };
}

/** One section with a short-lived URL to read its PDF. */
export async function fetchSpecSection(
  projectNumber: string,
  sectionId: string,
): Promise<{ section: CaSpecSection; url: string }> {
  return apiGet<{ section: CaSpecSection; url: string }>(`${base(projectNumber)}/${encodeURIComponent(sectionId)}`);
}

/** "Check for updates": the server asks the CA application for the current sections now. */
export async function checkSpecUpdates(projectNumber: string): Promise<void> {
  await apiPost(`${base(projectNumber)}/sync`, {});
}
