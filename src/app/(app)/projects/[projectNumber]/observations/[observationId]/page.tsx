"use client";

import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LuPrinter } from "react-icons/lu";

import { PageShell } from "@/components/PageShell";
import { ProjectBreadcrumb } from "@/components/ProjectBreadcrumb";
import { ReportPreview } from "@/components/ReportPreview";
import { notifyError } from "@/components/ui/toaster";
import { fetchObservation } from "@/services/observationService";
import { fetchProject } from "@/services/projectService";
import type { SavedObservation } from "@/types";

/**
 * A saved field observation.
 *
 * Read-only: the same `ReportPreview` as Step 4, without the edit callbacks.
 * Editing a committed record is deliberately not part of this build - see
 * "Known follow-ups" in the README.
 */
export default function SavedObservationPage() {
  const params = useParams<{ projectNumber: string; observationId: string }>();
  const projectNumber = decodeURIComponent(params.projectNumber);
  const observationId = params.observationId;

  const [observation, setObservation] = useState<SavedObservation | null>(null);
  const [projectName, setProjectName] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    fetchObservation(projectNumber, observationId)
      .then((result) => {
        if (active) setObservation(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFailed(true);
        notifyError("Could not load the field observation", error);
      });

    fetchProject(projectNumber)
      .then((project) => {
        if (active) setProjectName(project.name);
      })
      .catch(() => {
        // The report stands without it.
      });

    return () => {
      active = false;
    };
  }, [projectNumber, observationId]);

  const backToProject = (
    <Button asChild variant="outline" size={{ base: "lg", md: "md" }} width={{ base: "full", md: "auto" }}>
      <Link href={`/projects/${encodeURIComponent(projectNumber)}`}>
        Back to project
      </Link>
    </Button>
  );

  if (failed) {
    return (
      <PageShell
        title="Observation not found"
        description="It may have been removed, or the link may be incorrect."
        width="3xl"
      >
        {backToProject}
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={
        <ProjectBreadcrumb
          projectNumber={projectNumber}
          trailing={observation ? observation.equipment : "Observation"}
        />
      }
      title="Commissioning Field Observation"
      description={observation ? `Recorded against project ${projectNumber}` : undefined}
      width="3xl"
      actions={backToProject}
    >
      {observation === null ? (
        <HStack gap="3" py="8" justify="center">
          <Spinner size="sm" color="brand.solid" />
          <Text color="fg.muted">Loading the report…</Text>
        </HStack>
      ) : (
        <Stack gap={{ base: 5, md: 6 }}>
          <ReportPreview
            projectNumber={projectNumber}
            projectName={projectName}
            form={{
              equipment: observation.equipment,
              system: observation.system,
              location: observation.location,
              activity: observation.activity,
              observation: observation.observation,
              observedDate: observation.observedDate,
            }}
            photos={observation.photos}
            causes={observation.causes}
            actions={observation.actions}
          />

          <Button
            data-print="hide"
            variant="plain"
            size="sm"
            colorPalette="gray"
            alignSelf="flex-start"
            px="0"
            onClick={() => window.print()}
          >
            <LuPrinter />
            Print or save as PDF
          </Button>
        </Stack>
      )}
    </PageShell>
  );
}
