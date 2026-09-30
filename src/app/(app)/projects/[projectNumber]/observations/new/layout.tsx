"use client";

import { useParams } from "next/navigation";

import { ObservationDraftProvider } from "@/context/ObservationDraftContext";

/**
 * The wizard's state boundary.
 *
 * The draft provider lives here, one level above the four step routes, which is
 * what makes routed steps work: client-side navigation between them does not
 * remount this layout, so Step 1's data is still in memory on Step 4 while the
 * browser's own back gesture continues to behave normally.
 */
export default function NewObservationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ projectNumber: string }>();
  const projectNumber = decodeURIComponent(params.projectNumber);

  return (
    <ObservationDraftProvider projectNumber={projectNumber}>
      {children}
    </ObservationDraftProvider>
  );
}
