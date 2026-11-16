"use client";

import { LuRoute } from "react-icons/lu";

import { EmptyState } from "@/components/EmptyState";

/** Site Route tab: the photo-pin map and the tracking placeholder (Phase 3). */
export default function CaSiteRoutePage() {
  return (
    <EmptyState
      icon={<LuRoute />}
      title="Site Route is on its way"
      description="A map of this project's photo pins, in the order they were taken, will appear here."
    />
  );
}
