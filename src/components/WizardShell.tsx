"use client";

import { Stack } from "@chakra-ui/react";

import { PageShell } from "@/components/PageShell";
import { ProjectBreadcrumb } from "@/components/ProjectBreadcrumb";
import { StepIndicator } from "@/components/StepIndicator";
import { WORKFLOW_STEPS, type WorkflowStepSlug, stepIndex } from "@/lib/workflowSteps";

/**
 * Page frame shared by the four workflow steps: breadcrumb, progress
 * indicator, title and body. Keeping it in one component means the steps
 * themselves contain only their own form and nothing structural.
 */
export function WizardShell({
  projectNumber,
  step,
  description,
  width = "md",
  children,
}: {
  projectNumber: string;
  step: WorkflowStepSlug;
  description?: string;
  width?: "md" | "3xl" | "5xl";
  children: React.ReactNode;
}) {
  const index = stepIndex(step);

  return (
    <PageShell
      eyebrow={
        <Stack gap="4">
          <ProjectBreadcrumb
            projectNumber={projectNumber}
            trailing="New observation"
          />
          <StepIndicator current={step} />
        </Stack>
      }
      title={WORKFLOW_STEPS[index].label}
      description={description}
      width={width}
    >
      {children}
    </PageShell>
  );
}
