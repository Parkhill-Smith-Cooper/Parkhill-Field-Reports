import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { getCaFileStore, getCaRepository } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/** Every synced photo for the project, each with a short-lived read URL. */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the project's photos", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;

    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }

    const files = getCaFileStore();
    const photos = await repo.photos.list(p.projectNumber);
    const withUrls = await Promise.all(
      photos.map(async (photo) => ({ ...photo, url: await files.readUrl(photo.filePath) })),
    );
    return Response.json({ photos: withUrls });
  });
}
