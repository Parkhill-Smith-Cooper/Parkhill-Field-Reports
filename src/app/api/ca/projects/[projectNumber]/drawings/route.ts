import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/** The project's drawings (current and superseded), each with a short-lived read URL. */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the project's drawings", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;

    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    const files = getCaFileStore();
    const drawings = await repo.drawings.list(p.projectNumber);
    const withUrls = await Promise.all(
      drawings.map(async (d) => ({ ...d, url: await files.readUrl(d.filePath) })),
    );
    return Response.json({ drawings: withUrls });
  });
}
