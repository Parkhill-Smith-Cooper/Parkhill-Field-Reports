"use client";

import type { NewProjectInput, Project, VantagePointProject } from "@/types";

import { apiDelete, apiGet, apiPatch, apiPost, toError } from "./apiClient";

export async function fetchProjects(): Promise<Project[]> {
  const { projects } = await apiGet<{ projects: Project[] }>("/api/projects");
  return projects;
}

export async function fetchProject(projectNumber: string): Promise<Project> {
  const { project } = await apiGet<{ project: Project }>(
    `/api/projects/${encodeURIComponent(projectNumber)}`,
  );
  return project;
}

/** VantagePoint projects not yet set up in this app. */
export async function fetchVantagePointProjects(): Promise<VantagePointProject[]> {
  const { projects } = await apiGet<{ projects: VantagePointProject[] }>(
    "/api/vantagepoint-projects",
  );
  return projects;
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const { project } = await apiPost<{ project: Project }>(
    "/api/projects",
    input,
  );
  return project;
}

export async function updateProject(
  projectNumber: string,
  name: string,
): Promise<Project> {
  const { project } = await apiPatch<{ project: Project }>(
    `/api/projects/${encodeURIComponent(projectNumber)}`,
    { name },
  );
  return project;
}

/** Deletes the project and everything recorded against it. */
export async function deleteProject(projectNumber: string): Promise<void> {
  await apiDelete(`/api/projects/${encodeURIComponent(projectNumber)}`);
}

/** Downloads the project's editable Excel deficiency log. */
export async function downloadDeficiencyLogExcel(
  projectNumber: string,
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectNumber)}/deficiency-log`,
    { cache: "no-store" },
  );
  if (!response.ok) throw await toError(response);

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `Deficiency Log - ${projectNumber}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
