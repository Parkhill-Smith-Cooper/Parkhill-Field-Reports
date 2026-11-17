"use client";

import { apiDelete, apiGet, apiPatch, apiPost } from "@/services/apiClient";
import type {
  CaProject,
  CaSourceProject,
  NewCaProjectInput,
} from "@/types/ca";

const base = "/api/ca/projects";
const one = (projectNumber: string) => `${base}/${encodeURIComponent(projectNumber)}`;

export async function fetchCaProjects(): Promise<CaProject[]> {
  return (await apiGet<{ projects: CaProject[] }>(base)).projects;
}

export async function fetchCaProject(projectNumber: string): Promise<CaProject> {
  return (await apiGet<{ project: CaProject }>(one(projectNumber))).project;
}

export async function createCaProject(input: NewCaProjectInput): Promise<CaProject> {
  return (await apiPost<{ project: CaProject }>(base, input)).project;
}

export async function updateCaProject(
  projectNumber: string,
  patch: { name?: string; client?: string },
): Promise<CaProject> {
  return (await apiPatch<{ project: CaProject }>(one(projectNumber), patch)).project;
}

export async function deleteCaProject(projectNumber: string): Promise<void> {
  await apiDelete(one(projectNumber));
}

/** Projects the upstream source offers; `source: null` = manual entry only. */
export async function fetchCaSourceProjects(): Promise<{
  source: CaSourceProject["source"] | null;
  projects: CaSourceProject[];
}> {
  return apiGet("/api/ca/source-projects");
}
