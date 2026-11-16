import { apiError } from "@/lib/apiResponse";
import { caRoute, projectParam } from "@/lib/ca/apiRoute";
import { validatePin } from "@/lib/ca/validation";
import { currentUser } from "@/lib/currentUser";
import { isValidGeneratedId } from "@/lib/validation";
import { getCaRepository } from "@/repositories/ca";
import type { CaPin } from "@/types/ca";

/**
 * `PUT /api/ca/projects/{p}/pins/{pinId}` — idempotent pin sync.
 *
 * The id is generated on the device when the pin is dropped, so retries land
 * on the same record. The newer `clientUpdatedAt` wins. Deleting is a
 * `deleted: true` edit, so a deletion made offline syncs like any change.
 */

type Params = { params: Promise<{ projectNumber: string; pinId: string }> };

export async function PUT(request: Request, { params }: Params) {
  return caRoute("sync the pin", async () => {
    const p = await projectParam(params);
    if ("error" in p) return p.error;
    const { pinId } = await params;
    if (!isValidGeneratedId(pinId)) return apiError("Invalid pin id.", 400);

    const body = await request.json().catch(() => null);
    const problem = validatePin(body);
    if (problem) return apiError(problem, 400);
    const b = body as Pick<CaPin, "drawingId" | "x" | "y" | "label" | "note" | "createdAt" | "clientUpdatedAt" | "deleted">;

    const repo = getCaRepository();
    if (!(await repo.projects.get(p.projectNumber))) {
      return apiError(`Project ${p.projectNumber} was not found.`, 404);
    }
    if (!(await repo.drawings.get(p.projectNumber, b.drawingId))) {
      return apiError("The drawing for this pin was not found.", 404);
    }

    const pin = await repo.pins.upsert({
      id: pinId,
      projectNumber: p.projectNumber,
      drawingId: b.drawingId,
      x: b.x,
      y: b.y,
      label: b.label.trim(),
      note: b.note,
      createdAt: b.createdAt,
      createdBy: await currentUser(),
      clientUpdatedAt: b.clientUpdatedAt,
      ...(b.deleted ? { deleted: true } : {}),
    });
    return Response.json({ pin });
  });
}
