import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { withUrl } from "@/lib/ca/drawingSets";
import { getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/**
 * `GET /api/ca/projects/{p}/drawing-sets` — the project's uploaded drawing
 * sets (removed ones left out), each with its sheets and a short-lived URL
 * to read the PDF. Every device sees the same sets and sheet names.
 */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the drawing sets", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    const sets = (await repo.drawingSets.list(p.projectNumber)).filter((s) => !s.removed);
    return Response.json({ sets: await Promise.all(sets.map(withUrl)) });
  });
}
