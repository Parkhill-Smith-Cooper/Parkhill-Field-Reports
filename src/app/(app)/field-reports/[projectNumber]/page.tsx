import { redirect } from "next/navigation";

import { caProjectPath } from "@/lib/ca/routes";

/** A CA project opens on its reports, grouped by discipline. */
export default async function CaProjectIndex({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;
  redirect(caProjectPath(decodeURIComponent(projectNumber), "reports"));
}
