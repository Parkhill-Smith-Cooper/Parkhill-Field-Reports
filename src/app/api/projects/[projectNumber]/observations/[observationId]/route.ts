import { apiError, handleRoute } from "@/lib/apiResponse";
import { isValidGeneratedId, isValidProjectNumber } from "@/lib/validation";
import { getObservation } from "@/repositories/observationRepository";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ projectNumber: string; observationId: string }> },
) {
  return handleRoute("load the observation", async () => {
    const { projectNumber, observationId } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }
    if (!isValidGeneratedId(observationId)) {
      return apiError("Invalid observation id.", 400);
    }

    const observation = await getObservation(projectNumber, observationId);
    if (!observation) {
      return apiError("Observation was not found.", 404);
    }

    return Response.json({ observation });
  });
}
