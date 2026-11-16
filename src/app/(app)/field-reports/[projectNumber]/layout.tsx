"use client";

import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LuChevronRight } from "react-icons/lu";

import { CaProjectTabs } from "@/components/ca/CaProjectTabs";
import { CaSourceTag } from "@/components/ca/CaSourceTag";
import { PageShell } from "@/components/PageShell";
import { notifyError } from "@/components/ui/toaster";
import { CaProjectContext } from "@/context/CaProjectContext";
import { CA_HOME } from "@/lib/navigation";
import { fetchCaProject } from "@/services/ca/projectService";
import type { CaProject } from "@/types/ca";

/**
 * A CA project: its title and the Capture · Reports · Site Route tabs.
 * Loads the project once and shares it with every tab through context.
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
        if (active) setLoaded({ key: projectNumber, project: result });
      })
      .catch((error: unknown) => {
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
        actions={<CaSourceTag source={project.source} />}
      >
        <Stack gap={{ base: 5, md: 6 }}>
          <CaProjectTabs projectNumber={projectNumber} />
          {children}
        </Stack>
      </PageShell>
    </CaProjectContext.Provider>
  );
}
