"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  useObservationDraft,
  type ObservationDraft,
} from "@/context/ObservationDraftContext";
import { wizardPath, type WorkflowStepSlug } from "@/lib/workflowSteps";

/**
 * Keeps a step from rendering with nothing to show.
 *
 * Deep-linking to Step 3, or reloading it in a browser that has lost the
 * session mirror, would otherwise render an empty page with no explanation.
 * This sends the engineer back to the furthest step their draft supports.
 *
 * It waits for `hydrated`: deciding before the session mirror has been read
 * would bounce every reload back to Step 1, because the draft is momentarily
 * empty on the first client render. That is the easiest bug to introduce here.
 *
 * The requirements below are deliberately limited to *the data a step needs in
 * order to render* - not to re-validating earlier steps. That distinction is
 * what makes evaluating them on every render safe: no edit a step offers can
 * invalidate its own requirement, so the engineer can never be ejected
 * mid-edit. Concretely, suggested causes and actions cannot be deleted (only
 * engineer-authored ones can), and Step 4 edits wording rather than selection.
 * Re-checking Step 1's fields here would break that - clearing the observation
 * text while editing the report would throw the engineer back to Step 1.
 */
export function useStepGuard(
  projectNumber: string,
  current: WorkflowStepSlug,
): { ready: boolean } {
  const router = useRouter();
  const { draft, hydrated } = useObservationDraft();

  // `undefined` = not decided yet, `null` = this step is fine.
  const redirectTo = hydrated ? requiredStep(draft, current) : undefined;

  useEffect(() => {
    if (redirectTo) {
      router.replace(wizardPath(projectNumber, redirectTo));
    }
  }, [redirectTo, projectNumber, router]);

  return { ready: redirectTo === null };
}

function requiredStep(
  draft: ObservationDraft,
  current: WorkflowStepSlug,
): WorkflowStepSlug | null {
  const hasCauses = draft.causes.length > 0;
  const hasActions = draft.actions.length > 0;
  const hasSelectedCause = draft.causes.some((cause) => cause.selected);
  const hasSelectedAction = draft.actions.some((action) => action.selected);

  switch (current) {
    case "observation":
      return null;
    case "causes":
      // Causes only exist once Step 1 was completed and submitted, so their
      // presence is the proof that Step 1 is done.
      return hasCauses ? null : "observation";
    case "actions":
      if (!hasCauses) return "observation";
      return hasActions ? null : "causes";
    case "report":
      if (!hasCauses) return "observation";
      if (!hasActions) return "causes";
      if (!hasSelectedCause) return "causes";
      return hasSelectedAction ? null : "actions";
  }
}
