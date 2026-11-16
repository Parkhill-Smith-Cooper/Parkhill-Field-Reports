"use client";

import {
  Box,
  Button,
  HStack,
  Input,
  InputGroup,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  LuChevronRight,
  LuFolderOpen,
  LuRefreshCw,
  LuSearch,
  LuTriangleAlert,
} from "react-icons/lu";

import { CaNewProjectDialog } from "@/components/ca/CaNewProjectDialog";
import { CaProjectActions } from "@/components/ca/CaProjectActions";
import { CaSourceTag } from "@/components/ca/CaSourceTag";
import { EmptyState } from "@/components/EmptyState";
import { SectionEyebrow } from "@/components/FieldReportsMenu";
import { PageShell } from "@/components/PageShell";
import { notifyError } from "@/components/ui/toaster";
import {
  cacheProjects,
  forgetCachedProject,
  getCachedProjects,
  isNetworkFailure,
} from "@/lib/ca/offline/projectCache";
import { caProjectPath } from "@/lib/ca/routes";
import { fetchCaProjects } from "@/services/ca/projectService";
import type { CaProject } from "@/types/ca";

/**
 * CA Field Reports home: the project list (CA_plan.pdf p.1). The default
 * landing page after sign-in.
 */
export default function CaProjectsPage() {
  const [projects, setProjects] = useState<CaProject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [offlineCopy, setOfflineCopy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCaProjects()
      .then((result) => {
        void cacheProjects(result);
        if (active) {
          setProjects(result);
          setOfflineCopy(false);
        }
      })
      .catch(async (error: unknown) => {
        // No connection: show the projects this device has opened before.
        if (isNetworkFailure(error)) {
          const cached = await getCachedProjects();
          if (active && cached.length > 0) {
            setProjects(cached);
            setOfflineCopy(true);
            return;
          }
        }
        if (!active) return;
        notifyError("Could not load projects", error);
        // Not an empty list: a failure must not read as "no projects".
        setLoadError(error instanceof Error ? error.message : "The project list could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const visible = useMemo(() => {
    if (!projects) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(
      (p) =>
        p.projectNumber.toLowerCase().includes(needle) ||
        p.name.toLowerCase().includes(needle) ||
        p.client.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  return (
    <PageShell
      eyebrow={<SectionEyebrow section="ca" />}
      title="Projects"
      description="Select a project to record a construction administration field observation."
      width="5xl"
      actions={
        <CaNewProjectDialog
          onCreated={(project) => setProjects((current) => [project, ...(current ?? [])])}
        />
      }
    >
      {loadError ? (
        <EmptyState
          icon={<LuTriangleAlert />}
          title="Could not load projects"
          description={loadError}
          action={
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setProjects(null);
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}
            >
              <LuRefreshCw />
              Try again
            </Button>
          }
        />
      ) : projects === null ? (
        <HStack gap="3" py="8" justify="center">
          <Spinner size="sm" color="brand.solid" />
          <Text color="fg.muted">Loading projects…</Text>
        </HStack>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<LuFolderOpen />}
          title="No CA projects yet"
          description="Create a project to start capturing photos and writing field observation reports."
        />
      ) : (
        <Stack gap="4">
          {offlineCopy && (
            <Text fontSize="sm" color="fg.muted" data-testid="ca-offline-projects">
              Offline — showing projects saved on this device.
            </Text>
          )}
          {projects.length > 6 && (
            <InputGroup startElement={<LuSearch />} maxW={{ md: "sm" }}>
              <Input
                size="lg"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by number, name or client"
                autoComplete="off"
              />
            </InputGroup>
          )}

          {visible.length === 0 ? (
            <Text color="fg.muted" py="4">
              No projects match “{query}”.
            </Text>
          ) : (
            <Stack
              gap="0"
              borderWidth="1px"
              borderColor="line"
              borderRadius="lg"
              overflow="hidden"
              data-testid="ca-project-list"
            >
              {visible.map((project, index) => (
                <HStack
                  key={project.id}
                  gap="0"
                  borderTopWidth={index === 0 ? "0" : "1px"}
                  borderColor="line"
                  pr={{ base: 1, md: 2 }}
                  _hover={{ bg: "surface.muted" }}
                >
                  <Box
                    asChild
                    flex="1"
                    minW="0"
                    px={{ base: 4, md: 5 }}
                    py="4"
                    minH="64px"
                    _focusVisible={{ outline: "2px solid", outlineColor: "brand.focusRing", outlineOffset: "-2px" }}
                  >
                    <Link href={caProjectPath(project.projectNumber)}>
                      <HStack justify="space-between" gap="4">
                        <Stack gap="0.5" minW="0">
                          <HStack gap="2">
                            <Text fontSize="sm" fontWeight="semibold" color="brand.fg">
                              {project.projectNumber}
                            </Text>
                            <CaSourceTag source={project.source} />
                          </HStack>
                          <Text truncate>{project.name}</Text>
                          {project.client && (
                            <Text fontSize="sm" color="fg.muted" truncate>
                              {project.client}
                            </Text>
                          )}
                        </Stack>
                        <Box color="fg.subtle" flexShrink="0">
                          <LuChevronRight />
                        </Box>
                      </HStack>
                    </Link>
                  </Box>
                  <CaProjectActions
                    project={project}
                    onUpdated={(updated) =>
                      setProjects((current) => (current ?? []).map((p) => (p.id === updated.id ? updated : p)))
                    }
                    onDeleted={(projectNumber) => {
                      void forgetCachedProject(projectNumber);
                      setProjects((current) => (current ?? []).filter((p) => p.projectNumber !== projectNumber));
                    }}
                  />
                </HStack>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </PageShell>
  );
}
