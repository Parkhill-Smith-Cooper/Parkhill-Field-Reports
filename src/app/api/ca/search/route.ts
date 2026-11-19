import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { reportState } from "@/lib/ca/reportContent";
import { CA_SEARCH_LIMIT, CA_SEARCH_MAX, CA_SEARCH_MIN, normalizeSearch } from "@/lib/ca/search";
import { getCaRepository } from "@/repositories/ca";
import type { CaSearchResult } from "@/types/ca";

/**
 * Nav-bar search: `GET /api/ca/search?q=…` finds projects (by number, name or
 * client) and reports in every project (by number, who started them,
 * discipline or project). At most 20 of each.
 */
export async function GET(request: Request) {
  return caRoute("search", async () => {
    const q = normalizeSearch(new URL(request.url).searchParams.get("q"));
    if (!q) return apiError(`Search for ${CA_SEARCH_MIN} to ${CA_SEARCH_MAX} characters.`, 400);

    const repo = getCaRepository();
    const [projects, reports] = await Promise.all([repo.projects.list(), repo.reports.search(q, CA_SEARCH_LIMIT)]);
    const names = new Map(projects.map((p) => [p.projectNumber, p.name]));

    const result: CaSearchResult = {
      projects: projects
        .filter((p) => [p.projectNumber, p.name, p.client].some((v) => v?.toLowerCase().includes(q)))
        .slice(0, CA_SEARCH_LIMIT),
      reports: reports.map((r) => ({
        id: r.id,
        projectNumber: r.projectNumber,
        projectName: names.get(r.projectNumber) ?? r.draft.projectName,
        reportNumber: r.reportNumber,
        ...(r.discipline ? { discipline: r.discipline } : {}),
        ...(r.createdByName ? { createdByName: r.createdByName } : {}),
        state: reportState(r),
        updatedAt: r.updatedAt,
      })),
    };
    return Response.json(result);
  });
}
