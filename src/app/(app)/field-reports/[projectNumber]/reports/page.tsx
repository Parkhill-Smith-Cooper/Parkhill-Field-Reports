"use client";

import { LuFileText } from "react-icons/lu";

import { EmptyState } from "@/components/EmptyState";

/** Reports tab: Field Observation Reports and their issued revisions (Phase 4). */
export default function CaReportsPage() {
  return (
    <EmptyState
      icon={<LuFileText />}
      title="Field Observation Reports are on their way"
      description="Reports for this project, with their issued revisions, will be listed here."
    />
  );
}
