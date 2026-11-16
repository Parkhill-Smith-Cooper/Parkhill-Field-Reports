import { redirect } from "next/navigation";

import { caProjectPath } from "@/lib/ca/routes";

/** A CA project opens on its Capture tab: field users get there first. */
export default async function CaProjectIndex({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;
  redirect(caProjectPath(decodeURIComponent(projectNumber), "capture"));
}
