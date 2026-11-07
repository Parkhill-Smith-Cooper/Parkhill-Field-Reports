import { apiError, handleRoute } from "@/lib/apiResponse";
import { buildDeficiencyLogWorkbook } from "@/lib/deficiencyLogExcel";
import { isValidProjectNumber } from "@/lib/validation";
import { listObservations } from "@/repositories/observationRepository";
import { getProject } from "@/repositories/projectRepository";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The project's observations as an editable Excel deficiency log. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectNumber: string }> },
) {
  return handleRoute("export the deficiency log", async () => {
    const { projectNumber } = await params;

    if (!isValidProjectNumber(projectNumber)) {
      return apiError("Invalid project number.", 400);
    }

    const project = await getProject(projectNumber);
    if (!project) {
      return apiError(`Project ${projectNumber} was not found.`, 404);
    }

    const observations = await listObservations(projectNumber);
    if (observations.length === 0) {
      return apiError("This project has no observations to export.", 400);
    }

    const workbook = await buildDeficiencyLogWorkbook(
      projectNumber,
      project.name,
      observations,
    );

    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="Deficiency Log - ${projectNumber}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
