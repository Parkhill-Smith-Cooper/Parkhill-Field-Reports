import { apiError, handleRoute } from "@/lib/apiResponse";
import { isValidProjectNumber } from "@/lib/validation";
import { getProject } from "@/repositories/projectRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectNumber: string }> },
) {
  return handleRoute("load the project", async () => {
    const { projectNumber } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }

    const project = await getProject(projectNumber);
    if (!project) {
      return apiError(`Project ${projectNumber} was not found.`, 404);
    }

    return Response.json({ project });
  });
}
