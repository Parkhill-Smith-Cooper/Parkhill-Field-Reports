import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the CA project", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;

    const project = await getCaRepository().projects.get(p.projectNumber);
    if (!project) return apiError(`Project ${p.projectNumber} was not found.`, 404);
    return Response.json({ project });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return caRoute("update the CA project", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;

    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      return apiError("Request body must be an object.", 400);
    }
    const { name, client } = body as Record<string, unknown>;
    const patch: { name?: string; client?: string } = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.length > 200) {
        return apiError("Project name is required (200 characters or fewer).", 400);
      }
      patch.name = name.trim();
    }
    if (client !== undefined) {
      if (typeof client !== "string" || client.length > 300) {
        return apiError("Client must be 300 characters or fewer.", 400);
      }
      patch.client = client.trim();
    }

    const project = await getCaRepository().projects.update(p.projectNumber, patch);
    if (!project) return apiError(`Project ${p.projectNumber} was not found.`, 404);
    return Response.json({ project });
  });
}

/**
 * Deleting is refused once any report has been issued: issued revisions are
 * permanent records and must stay unchanged, so a project holding them cannot
 * be removed from the app.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return caRoute("delete the CA project", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;

    const repo = getCaRepository();
    const reports = await repo.reports.list(p.projectNumber);
    if (reports.some((report) => report.latestRevision !== null)) {
      return apiError(
        "This project has issued reports, which are permanent records. It cannot be deleted.",
        409,
      );
    }

    const deleted = await repo.projects.delete(p.projectNumber);
    if (!deleted) return apiError(`Project ${p.projectNumber} was not found.`, 404);
    return Response.json({ deleted: true });
  });
}
