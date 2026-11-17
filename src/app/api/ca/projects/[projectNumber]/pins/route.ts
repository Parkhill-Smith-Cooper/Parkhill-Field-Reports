import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/** Every pin on the project's drawings, including deleted ones (so devices learn of deletions). */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the project's pins", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    return Response.json({ pins: await repo.pins.list(p.projectNumber) });
  });
}
