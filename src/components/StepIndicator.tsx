"use client";

import { Box, HStack, Progress, Steps, Text } from "@chakra-ui/react";

import { WORKFLOW_STEPS, type WorkflowStepSlug, stepIndex } from "@/lib/workflowSteps";

/**
 * Workflow progress.
 *
 * `Steps.Root` is used in controlled, display-only mode: the current index is
 * derived from the route the engineer is on, and no triggers are rendered, so
 * this can only ever reflect progress rather than become a second, competing
 * source of navigation.
 *
 * Two presentations rather than one squeezed layout: four labelled steps with
 * connectors will not fit legibly at 390px, so phones get a counter, the name
 * of the current step and a progress bar - which is what actually matters in
 * the field - while desktop gets the full stepper.
 */
export function StepIndicator({ current }: { current: WorkflowStepSlug }) {
  const index = stepIndex(current);
  const step = WORKFLOW_STEPS[index];

  return (
    <Box data-print="hide">
      {/* Mobile */}
      <Box hideFrom="md">
        <HStack justify="space-between" align="baseline" mb="2" gap="3">
          <Text fontSize="sm" fontWeight="semibold" color="brand.fg" truncate>
            {step.label}
          </Text>
          <Text fontSize="xs" color="fg.muted" flexShrink="0">
            Step {index + 1} of {WORKFLOW_STEPS.length}
          </Text>
        </HStack>
        <Progress.Root
          value={((index + 1) / WORKFLOW_STEPS.length) * 100}
          colorPalette="brand"
          size="sm"
        >
          <Progress.Track borderRadius="full">
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      </Box>

      {/* Desktop */}
      <Box hideBelow="md">
        <Steps.Root
          step={index}
          count={WORKFLOW_STEPS.length}
          colorPalette="brand"
          size="sm"
        >
          <Steps.List>
            {WORKFLOW_STEPS.map((workflowStep, i) => (
              <Steps.Item
                key={workflowStep.slug}
                index={i}
                title={workflowStep.label}
              >
                <Steps.Indicator />
                <Steps.Title whiteSpace="nowrap">{workflowStep.label}</Steps.Title>
                <Steps.Separator />
              </Steps.Item>
            ))}
          </Steps.List>
        </Steps.Root>
      </Box>
    </Box>
  );
}
