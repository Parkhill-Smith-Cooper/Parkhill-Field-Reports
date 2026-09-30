import "server-only";

import { cosmosStatus, projectsContainer } from "@/lib/azure/cosmos";
import { currentUser } from "@/lib/currentUser";
import type { NewProjectInput, Project } from "@/types";

/**
 * All Cosmos access for projects. Route handlers call these; nothing else in
 * the app touches the database.
 */

export class ProjectAlreadyExistsError extends Error {
  constructor(projectNumber: string) {
    super(`Project ${projectNumber} already exists.`);
    this.name = "ProjectAlreadyExistsError";
  }
}

export async function listProjects(): Promise<Project[]> {
  const { resources } = await projectsContainer()
    .items.query<Project>({
      query:
        "SELECT c.id, c.projectNumber, c.name, c.createdAt, c.createdBy, c.updatedAt FROM c ORDER BY c.createdAt DESC",
    })
    .fetchAll();
  return resources;
}

export async function getProject(projectNumber: string): Promise<Project | null> {
  try {
    // `id` is set equal to `projectNumber`, so this is a point read - the
    // cheapest operation Cosmos offers - rather than a query.
    const { resource } = await projectsContainer()
      .item(projectNumber, projectNumber)
      .read<Project>();
    return resource ?? null;
  } catch (error) {
    if (cosmosStatus(error) === 404) return null;
    throw error;
  }
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    // Deliberately identical to the partition key: it makes every lookup a
    // point read and lets Cosmos itself enforce uniqueness of project numbers.
    id: input.projectNumber,
    projectNumber: input.projectNumber,
    name: input.name,
    createdAt: now,
    createdBy: await currentUser(),
    updatedAt: now,
  };

  try {
    const { resource } = await projectsContainer().items.create(project, {
      disableAutomaticIdGeneration: true,
    });
    return resource ?? project;
  } catch (error) {
    if (cosmosStatus(error) === 409) {
      throw new ProjectAlreadyExistsError(input.projectNumber);
    }
    throw error;
  }
}
