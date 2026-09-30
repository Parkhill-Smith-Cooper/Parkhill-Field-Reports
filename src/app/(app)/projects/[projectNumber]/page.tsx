"use client";

import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LuClipboardList, LuPlus } from "react-icons/lu";

import { EmptyState } from "@/components/EmptyState";
import { ObservationList } from "@/components/ObservationList";
import { PageShell } from "@/components/PageShell";
import { ProjectBreadcrumb } from "@/components/ProjectBreadcrumb";
import { notifyError } from "@/components/ui/toaster";
import { wizardPath } from "@/lib/workflowSteps";
import { fetchObservations } from "@/services/observationService";
import { fetchProject } from "@/services/projectService";
import type { Project, SavedObservation } from "@/types";

/** Project detail: what this project is, and everything recorded against it. */
export default function ProjectPage() {
  const params = useParams<{ projectNumber: string }>();
  const projectNumber = decodeURIComponent(params.projectNumber);

  const [project, setProject] = useState<Project | null>(null);
  const [observations, setObservations] = useState<SavedObservation[] | null>(
    null,
  );
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;

    fetchProject(projectNumber)
      .then((result) => {
        if (active) setProject(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setNotFound(true);
        notifyError("Could not load the project", error);
      });

    fetchObservations(projectNumber)
      .then((result) => {
        if (active) setObservations(result);
      })
      .catch(() => {
        // The project-level error above is the one worth showing; a second
        // toast for the same underlying cause is just noise.
        if (active) setObservations([]);
      });

    return () => {
      active = false;
    };
  }, [projectNumber]);

  const newObservationHref = wizardPath(projectNumber, "observation");

  if (notFound) {
    return (
      <PageShell
        title="Project not found"
        description={`No project with number ${projectNumber} exists.`}
        width="5xl"
      >
        <Button asChild variant="outline" alignSelf="flex-start">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={<ProjectBreadcrumb projectNumber={projectNumber} />}
      title={project?.name ?? projectNumber}
      description={project ? `Project ${project.projectNumber}` : undefined}
      width="5xl"
      actions={
        <Button
          asChild
          colorPalette="brand"
          size={{ base: "lg", md: "md" }}
          width={{ base: "full", md: "auto" }}
        >
          <Link href={newObservationHref}>
            <LuPlus />
            New observation
          </Link>
        </Button>
      }
    >
      <Stack gap="3">
        <Text fontSize="sm" fontWeight="semibold" color="fg.muted" textTransform="uppercase" letterSpacing="wide">
          Field observations
        </Text>

        {observations === null ? (
          <HStack gap="3" py="8" justify="center">
            <Spinner size="sm" color="brand.solid" />
            <Text color="fg.muted">Loading observations…</Text>
          </HStack>
        ) : observations.length === 0 ? (
          <EmptyState
            icon={<LuClipboardList />}
            title="No observations recorded"
            description="Start a new field observation to work through potential causes, corrective actions and a report."
            action={
              <Button asChild colorPalette="brand" size="sm">
                <Link href={newObservationHref}>
                  <LuPlus />
                  New observation
                </Link>
              </Button>
            }
          />
        ) : (
          <ObservationList
            projectNumber={projectNumber}
            observations={observations}
          />
        )}
      </Stack>
    </PageShell>
  );
}
