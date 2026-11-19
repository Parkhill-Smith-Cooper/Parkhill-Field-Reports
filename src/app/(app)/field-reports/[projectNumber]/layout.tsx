"use client";

import { Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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
        // Keep the project's reports page (and every report in it) and its
        // specifications page loadable offline.
        keepForOffline([caProjectPath(projectNumber, "reports"), caProjectPath(projectNumber, "specs")]);
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
        <Stack gap={{ base: 5, md: 6 }}>
          {/* useSearchParams needs a Suspense boundary in the App Router. */}
          <Suspense fallback={null}>
            <CaProjectTabs projectNumber={projectNumber} />
          </Suspense>
          {children}
        </Stack>
      </PageShell>
    </CaProjectContext.Provider>
  );
}

/**
 * Reports | Specifications. Hidden inside a report (`?report=`), where the
 * report's own steps are the navigation and printing must not show it.
 */
function CaProjectTabs({ projectNumber }: { projectNumber: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  if (search.get("report")) return null;
  const tabs = [
    { key: "reports", label: "Reports", href: caProjectPath(projectNumber, "reports") },
    { key: "specs", label: "Specifications", href: caProjectPath(projectNumber, "specs") },
  ] as const;
  return (
    <HStack data-print="hide" gap="1" role="tablist" borderBottomWidth="1px">
      {tabs.map((tab) => {
        const active = pathname?.endsWith(`/${tab.key}`) ?? false;
        return (
          <Button
            key={tab.key}
            asChild
            variant="ghost"
            size="lg"
            role="tab"
            aria-selected={active}
            borderRadius="0"
            borderBottomWidth="2px"
            borderColor={active ? "brand.solid" : "transparent"}
            color={active ? "fg" : "fg.muted"}
            mb="-1px"
          >
            <Link href={tab.href}>{tab.label}</Link>
          </Button>
        );
      })}
    </HStack>
  );
}
