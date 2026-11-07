import { apiError, handleRoute } from "@/lib/apiResponse";
import { isValidProjectNumber, validateProjectName } from "@/lib/validation";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/repositories/projectRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectNumber: string }> },
) {
  return handleRoute("load the project", async () => {
    const { projectNumber } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }

    const project = await getProject(projectNumber);
    if (!project) {
      return apiError(`Project ${projectNumber} was not found.`, 404);
    }

    return Response.json({ project });
  });
}

/** Renames a project. Only the name is editable. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectNumber: string }> },
) {
  return handleRoute("update the project", async () => {
    const { projectNumber } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }

    const body: unknown = await request.json().catch(() => null);
    const name = (body as { name?: unknown } | null)?.name;
    const problem = validateProjectName(name);
    if (problem) {
      return apiError(problem, 400);
    }

    const project = await updateProject(projectNumber, (name as string).trim());
    if (!project) {
      return apiError(`Project ${projectNumber} was not found.`, 404);
    }

    return Response.json({ project });
  });
}

/** Deletes a project together with its observations and photos. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectNumber: string }> },
) {
  return handleRoute("delete the project", async () => {
    const { projectNumber } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }

    const result = await deleteProject(projectNumber);
    if (!result) {
      return apiError(`Project ${projectNumber} was not found.`, 404);
    }

    return Response.json({ deleted: true, ...result });
  });
}
