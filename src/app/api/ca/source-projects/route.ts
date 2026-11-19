import { caRoute } from "@/lib/ca/apiRoute";
import { loadSourceProjects } from "@/lib/ca/sourceProjects";
import { getCaProjectFallbackSource, getCaProjectSource, getCaRepository } from "@/repositories/ca";

/**
 * The projects New Project offers: from the CA application, or from
 * VantagePoint when the CA application cannot be reached. Projects already set
 * up here are included with `alreadyCreated: true` so they can be shown greyed
 * out. `source: null` means no source answered, so only manual entry is offered.
 */
export async function GET() {
  return caRoute("load projects from the project source", async () => {
    const existing = await getCaRepository().projects.list();
    const result = await loadSourceProjects({
      primary: getCaProjectSource(),
      fallback: getCaProjectFallbackSource(),
      existingProjectNumbers: existing.map((p) => p.projectNumber),
    });
    return Response.json(result);
  });
}
