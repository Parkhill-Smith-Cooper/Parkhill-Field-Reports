"use client";

import {
  Button,
  HStack,
  Menu,
  Portal,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LuChevronDown,
  LuClipboardList,
  LuDownload,
  LuFileSpreadsheet,
  LuFileText,
  LuPlus,
  LuPrinter,
} from "react-icons/lu";

import { EmptyState } from "@/components/EmptyState";
import { ObservationList } from "@/components/ObservationList";
import { PageShell } from "@/components/PageShell";
import { ProjectReport } from "@/components/ProjectReport";
import { ProjectBreadcrumb } from "@/components/ProjectBreadcrumb";
import { notifyError } from "@/components/ui/toaster";
import { wizardPath } from "@/lib/workflowSteps";
import { fetchObservations } from "@/services/observationService";
import { downloadDeficiencyLogPdf } from "@/lib/deficiencyLogPdf";
import {
  downloadDeficiencyLogExcel,
  fetchProject,
} from "@/services/projectService";
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
  const [exporting, setExporting] = useState(false);

  async function exportLog(format: "xlsx" | "pdf") {
    if (!observations || observations.length === 0) return;
    setExporting(true);
    try {
      if (format === "xlsx") {
        await downloadDeficiencyLogExcel(projectNumber);
      } else {
        await downloadDeficiencyLogPdf(
          projectNumber,
          project?.name,
          observations,
        );
      }
    } catch (error) {
      notifyError("Could not export the deficiency log", error);
    } finally {
      setExporting(false);
    }
  }

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
        <Stack direction={{ base: "column", md: "row" }} gap="3">
          <Button
            variant="outline"
            size={{ base: "lg", md: "md" }}
            width={{ base: "full", md: "auto" }}
            disabled={!observations || observations.length === 0}
            onClick={() => window.print()}
          >
            <LuPrinter />
            Print report
          </Button>
          <Menu.Root positioning={{ placement: "bottom-end" }}>
            <Menu.Trigger asChild>
              <Button
                variant="outline"
                size={{ base: "lg", md: "md" }}
                width={{ base: "full", md: "auto" }}
                loading={exporting}
                disabled={!observations || observations.length === 0}
              >
                <LuDownload />
                Export deficiency log
                <LuChevronDown />
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content>
                  <Menu.Item
                    value="xlsx"
                    cursor="pointer"
                    onClick={() => void exportLog("xlsx")}
                  >
                    <LuFileSpreadsheet />
                    Excel (editable .xlsx)
                  </Menu.Item>
                  <Menu.Item
                    value="pdf"
                    cursor="pointer"
                    onClick={() => void exportLog("pdf")}
                  >
                    <LuFileText />
                    PDF
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
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
        </Stack>
      }
    >
      {observations && observations.length > 0 && (
        <ProjectReport
          projectNumber={projectNumber}
          projectName={project?.name}
          observations={observations}
        />
      )}

      {/* The on-screen list; the printed report replaces it on paper. */}
      <Stack gap="3" data-print="hide">
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
            description="Start a new field observation to work through recommended diagnostic checks, corrective actions and a report."
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
