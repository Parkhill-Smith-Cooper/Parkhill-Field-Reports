import { redirect } from "next/navigation";

import { caProjectPath } from "@/lib/ca/routes";

/**
 * Capture and Site Route are now steps inside each report (see
 * `CaReportCaptureStep` / `CaReportRouteStep`). Old links land on the
 * project's reports, grouped by discipline.
 */
export default async function CaProjectCaptureRedirect({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;
  redirect(caProjectPath(decodeURIComponent(projectNumber), "reports"));
}
