import { after } from "next/server";

import { apiError } from "@/lib/apiResponse";
import { caRoute } from "@/lib/ca/apiRoute";
import { scheduleReconcile } from "@/lib/ca/drawingSync";
import { validateNewCaProject } from "@/lib/ca/validation";
import { currentUser } from "@/lib/currentUser";
import { caDrawingSyncDeps, getCaRepository } from "@/repositories/ca";
import type { NewCaProjectInput } from "@/types/ca";

export async function GET() {
  return caRoute("load CA projects", async () => {
    const projects = await getCaRepository().projects.list();
    return Response.json({ projects });
  });
}

export async function POST(request: Request) {
  return caRoute("create the CA project", async () => {
    const body: unknown = await request.json().catch(() => null);
    const problem = validateNewCaProject(body);
    if (problem) return apiError(problem, 400);

    const input = body as NewCaProjectInput;
    const project = await getCaRepository().projects.create(
      {
        projectNumber: input.projectNumber,
        name: input.name.trim(),
        client: input.client?.trim() ?? "",
        source: input.source,
        externalRef: input.externalRef,
      },
      await currentUser(),
    );
    // Bring in its current drawing set from the CA application right away.
    after(() =>
      scheduleReconcile(caDrawingSyncDeps, project.projectNumber, { force: true }).then(() => undefined),
    );
    return Response.json({ project }, { status: 201 });
  });
}
