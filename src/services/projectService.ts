"use client";

import type { NewProjectInput, Project } from "@/types";

import { apiGet, apiPost } from "./apiClient";

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

export async function createProject(input: NewProjectInput): Promise<Project> {
  const { project } = await apiPost<{ project: Project }>(
    "/api/projects",
    input,
  );
  return project;
}
