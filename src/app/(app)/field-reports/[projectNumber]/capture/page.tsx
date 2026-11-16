"use client";

import { LuCamera } from "react-icons/lu";

import { EmptyState } from "@/components/EmptyState";

/** Capture tab: floor plans, photo pins and the photo inbox (Phases 2–3). */
export default function CaCapturePage() {
  return (
    <EmptyState
      icon={<LuCamera />}
      title="Photo capture is on its way"
      description="Floor plans, photo pins and offline photo capture will appear here."
    />
  );
}
