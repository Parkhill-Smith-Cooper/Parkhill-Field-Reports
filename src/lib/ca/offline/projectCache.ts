"use client";

import { ApiRequestError } from "@/services/apiClient";
import type { CaProject } from "@/types/ca";

import { openCaDb } from "./db";

/**
 * Project records cached on the device, so the project list and a project's
 * screens still open with no signal. Only used when the server cannot be
 * reached - an HTTP error (404, 403) is a real answer and is never masked.
 */

/** True for "could not reach the server", false for an HTTP error response. */
export function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof ApiRequestError);
}

export async function cacheProjects(projects: CaProject[]): Promise<void> {
  try {
    const db = await openCaDb();
    const tx = db.transaction("projects", "readwrite");
    const cachedAt = new Date().toISOString();
    await Promise.all(projects.map((p) => tx.store.put({ ...p, cachedAt })));
    await tx.done;
  } catch {
    // Storage unavailable (private mode): offline fallback is lost, nothing else.
  }
}

function withoutCacheStamp(entry: CaProject & { cachedAt?: string }): CaProject {
  const project = { ...entry };
  delete project.cachedAt;
  return project;
}

export async function getCachedProject(projectNumber: string): Promise<CaProject | null> {
  try {
    const hit = await (await openCaDb()).get("projects", projectNumber);
    return hit ? withoutCacheStamp(hit) : null;
  } catch {
    return null;
  }
}

export async function getCachedProjects(): Promise<CaProject[]> {
  try {
    const all = await (await openCaDb()).getAll("projects");
    return all
      .map(withoutCacheStamp)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function forgetCachedProject(projectNumber: string): Promise<void> {
  try {
    await (await openCaDb()).delete("projects", projectNumber);
  } catch {
    // ignore
  }
}
