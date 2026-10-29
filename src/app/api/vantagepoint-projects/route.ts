import { handleRoute } from "@/lib/apiResponse";
import { isValidProjectNumber } from "@/lib/validation";
import { listProjects } from "@/repositories/projectRepository";
import { listVantagePointProjects } from "@/repositories/vantagepointRepository";

/**
 * The New Project picker's options: VantagePoint projects that have not been
 * set up here yet. Projects that already exist are hidden, as in parkhill-ccr,
 * and Cosmos still rejects a duplicate if two people race for the same one.
 */
export async function GET() {
  return handleRoute("load VantagePoint projects", async () => {
    const [vantagePoint, existing] = await Promise.all([
      listVantagePointProjects(),
      listProjects(),
    ]);
    const taken = new Set(existing.map((project) => project.projectNumber));

    const projects = vantagePoint.filter(
      (project) =>
        // A number that could not be stored as a Cosmos id is not offered.
        isValidProjectNumber(project.projectNumber) &&
        !taken.has(project.projectNumber),
    );
    return Response.json({ projects });
  });
}
