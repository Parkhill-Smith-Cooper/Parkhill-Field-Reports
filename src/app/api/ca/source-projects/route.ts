import { caRoute } from "@/lib/ca/apiRoute";
import { getCaProjectSource, getCaRepository } from "@/repositories/ca";

/**
 * Projects the configured upstream source offers that are not set up here yet.
 * `source: null` means no source is configured, so only manual entry is offered.
 */
export async function GET() {
  return caRoute("load projects from the project source", async () => {
    const source = getCaProjectSource();
    if (!source) return Response.json({ source: null, projects: [] });

    const [offered, existing] = await Promise.all([
      source.list(),
      getCaRepository().projects.list(),
    ]);
    const taken = new Set(existing.map((p) => p.projectNumber));
    return Response.json({
      source: source.kind,
      projects: offered.filter((p) => !taken.has(p.projectNumber)),
    });
  });
}
