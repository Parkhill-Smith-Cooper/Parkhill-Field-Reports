import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { caConfig } from "@/lib/ca/config";
import { scheduleReconcile } from "@/lib/ca/drawingSync";
import { bearerToken, DRAWING_SYNC_ROLE, verifyServiceToken } from "@/lib/ca/serviceAuth";
import { validateDrawingSyncPush } from "@/lib/ca/validation";
import { caDrawingSyncDeps } from "@/repositories/ca";

/**
 * `POST /api/ca/integrations/ccr/drawing-sets` — the CA application (ccr)
 * tells Field Reports that a project's Document Control set changed:
 * `{ projectNumber, versionId?, event: "published" | "updated" | "removed" }`.
 *
 * Not a user request: there is no session. `proxy.ts` lets this path
 * through, and the caller must present an app-only Entra token with the
 * `FieldReports.DrawingSync` role from the CA application's identity
 * (`src/lib/ca/serviceAuth.ts`).
 *
 * The body only names the project. Whatever the event, Field Reports then
 * asks ccr which set is current and copies it (`reconcile`), so ccr stays
 * the one that says which set is current, and a lost or out-of-order push
 * cannot leave the wrong set current. Answers 202 at once; the copy runs
 * after the response. A project not set up in Field Reports is ignored.
 */
export async function POST(request: Request) {
  return caRoute("accept the drawing-set update", async () => {
    const tenantId = caConfig.caSyncTenantId;
    const audiences = caConfig.caSyncApiAudience.split(",").map((a) => a.trim()).filter(Boolean);
    const allowedClientId = caConfig.caSyncAllowedClientId;
    if (!tenantId || audiences.length === 0 || !allowedClientId) {
      return apiError("Drawing-set sync is not configured.", 503);
    }

    const auth = await verifyServiceToken(bearerToken(request), {
      tenantId,
      audiences,
      allowedClientId,
      role: DRAWING_SYNC_ROLE,
    });
    if (!auth.ok) {
      console.warn(`[CA] Drawing-set push refused: ${auth.reason}`);
      return apiError(auth.status === 401 ? "Unauthorized." : "Forbidden.", auth.status);
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const problem = validateDrawingSyncPush(body);
    if (problem) return apiError(problem, 400);
    const { projectNumber, versionId, event } = body as {
      projectNumber: string;
      versionId?: string;
      event: string;
    };

    console.info(`[CA] Drawing-set ${event} for ${projectNumber}${versionId ? ` (${versionId})` : ""}; syncing.`);
    after(() => scheduleReconcile(caDrawingSyncDeps, projectNumber, { force: true }).then(() => undefined));
    return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  });
}
