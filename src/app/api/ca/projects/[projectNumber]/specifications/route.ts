import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { currentSpecSections } from "@/lib/ca/specSections";
import { isSyncingSpecs, scheduleSpecReconcile } from "@/lib/ca/specSync";
import { caSpecSyncDeps, getCaRepository, getCaSpecSource } from "@/repositories/ca";

type Params = { params: Promise<{ projectNumber: string }> };

/** How long a listing waits for a sync it started before answering anyway. */
const WAIT_FOR_SYNC_MS = 8_000;

/**
 * `GET /api/ca/projects/{p}/specifications` — the current revision of every
 * specification section, by number. Records only: a section's PDF URL comes
 * from `GET .../specifications/{sectionId}` when someone opens it, so a list
 * of hundreds of sections does not sign hundreds of URLs.
 *
 * Listing also keeps the sections in step with the CA application (at most
 * every few minutes). A quick sync is waited for; a long one (a first sync of
 * a whole project manual) carries on, and `syncing: true` says to ask again.
 */
export async function GET(_request: Request, { params }: Params) {
  return caRoute("load the specifications", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }

    const sync = scheduleSpecReconcile(caSpecSyncDeps, p.projectNumber);
    after(() => sync.then(() => undefined));
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([sync, new Promise((resolve) => (timer = setTimeout(resolve, WAIT_FOR_SYNC_MS)))]);
    clearTimeout(timer);

    return Response.json({
      sections: currentSpecSections(await repo.specSections.list(p.projectNumber)),
      syncing: isSyncingSpecs(p.projectNumber),
      hasSource: getCaSpecSource() !== null,
    });
  });
}
