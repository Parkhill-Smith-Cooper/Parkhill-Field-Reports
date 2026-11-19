"use client";

import { Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LuChevronRight } from "react-icons/lu";

import { CaSourceTag } from "@/components/ca/CaSourceTag";
import { CaSyncStatus } from "@/components/ca/CaSyncStatus";
import { cacheProjects, getCachedProject, isNetworkFailure } from "@/lib/ca/offline/projectCache";
import { keepForOffline } from "@/lib/ca/offline/shell";
import { caProjectPath } from "@/lib/ca/routes";
import { PageShell } from "@/components/PageShell";
import { notifyError } from "@/components/ui/toaster";
import { CaProjectContext } from "@/context/CaProjectContext";
import { CA_HOME } from "@/lib/navigation";
import { fetchCaProject } from "@/services/ca/projectService";
import type { CaProject } from "@/types/ca";

/**
 * A CA project: its title, then its reports grouped by discipline. Each report
 * has its own Capture · Report · Site Route steps. Loads the project once and
 * shares it through context.
 */
export default function CaProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectNumber: string }>();
  const projectNumber = decodeURIComponent(params.projectNumber);

  // Keyed by project number, so navigating to another project never shows
  // the previous one's data while the new one loads.
  const [loaded, setLoaded] = useState<{
    key: string;
    project?: CaProject;
    error?: string;
  } | null>(null);
  const current = loaded?.key === projectNumber ? loaded : null;
  const project = current?.project ?? null;
  const failed = current?.error ?? null;
  const setProject = (next: CaProject) => setLoaded({ key: projectNumber, project: next });

  useEffect(() => {
    let active = true;
    fetchCaProject(projectNumber)
      .then((result) => {
        void cacheProjects([result]);
        // Keep the project's reports page (and every report in it) loadable offline.
        keepForOffline([caProjectPath(projectNumber, "reports")]);
        if (active) setLoaded({ key: projectNumber, project: result });
      })
      .catch(async (error: unknown) => {
        // No connection: open the copy cached on this device, if there is one.
        if (isNetworkFailure(error)) {
          const cached = await getCachedProject(projectNumber);
          if (cached) {
            if (active) setLoaded({ key: projectNumber, project: cached });
            return;
          }
        }
        if (!active) return;
        setLoaded({
          key: projectNumber,
          error: error instanceof Error ? error.message : "The project could not be loaded.",
        });
        notifyError("Could not load the project", error);
      });
    return () => {
      active = false;
    };
  }, [projectNumber]);

  const breadcrumb = (
    <HStack data-print="hide" gap="1.5" fontSize="sm" color="fg.muted" wrap="wrap">
      <Text asChild _hover={{ color: "brand.fg" }}>
        <Link href={CA_HOME}>CA Projects</Link>
      </Text>
      <LuChevronRight aria-hidden />
      <Text color="fg">{projectNumber}</Text>
    </HStack>
  );

  if (failed) {
    return (
      <PageShell eyebrow={breadcrumb} title="Project not available" description={failed} width="5xl">
        <Button asChild variant="outline" size="lg" alignSelf="flex-start">
          <Link href={CA_HOME}>Back to CA projects</Link>
        </Button>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell eyebrow={breadcrumb} title={projectNumber} width="5xl">
        <HStack gap="3" py="8" justify="center">
          <Spinner size="sm" color="brand.solid" />
          <Text color="fg.muted">Loading project…</Text>
        </HStack>
      </PageShell>
    );
  }

  return (
    <CaProjectContext.Provider value={{ projectNumber, project, setProject }}>
      <PageShell
        eyebrow={breadcrumb}
        title={project.name}
        description={[`Project ${project.projectNumber}`, project.client].filter(Boolean).join(" · ")}
        width="5xl"
        actions={
          <Stack direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap="3">
            <CaSyncStatus />
            <Box alignSelf={{ base: "flex-start", md: "center" }}>
              <CaSourceTag source={project.source} />
            </Box>
          </Stack>
        }
      >
        <Stack gap={{ base: 5, md: 6 }}>{children}</Stack>
      </PageShell>
    </CaProjectContext.Provider>
  );
}
