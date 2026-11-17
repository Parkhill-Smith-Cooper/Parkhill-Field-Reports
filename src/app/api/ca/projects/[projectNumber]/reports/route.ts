import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/** The project's Field Observation Reports, newest number first. */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the project's reports", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    return Response.json({ reports: await repo.reports.list(p.projectNumber) });
  });
}
