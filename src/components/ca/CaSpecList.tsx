"use client";

import { Badge, Box, Button, HStack, Input, Spinner, Stack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight, LuDownload, LuFileText, LuRefreshCw } from "react-icons/lu";

import { notifyError } from "@/components/ui/toaster";
import { useCaProject } from "@/context/CaProjectContext";
import { isNetworkFailure } from "@/lib/ca/offline/projectCache";
import {
  cachedSpecFile,
  cachedSpecFileIds,
  listCachedSpecSections,
  mirrorSpecSections,
  storeSpecFile,
} from "@/lib/ca/offline/specCache";
import { divisionLabel, formatSpecRevision, groupByDivision, specSectionMatches } from "@/lib/ca/specSections";
import { apiGetBlob } from "@/services/apiClient";
import { checkSpecUpdates, fetchSpecSection, fetchSpecSections } from "@/services/ca/specService";
import type { CaSpecSection } from "@/types/ca";

/** How soon to ask again while the server is still copying from the CA application. */
const SYNC_POLL_MS = 5_000;

/**
 * The project's specifications, synced from the CA application's Document
 * Control: the current revision of every section, grouped by MasterFormat
 * division. Read only — sections are published in the CA application.
 *
 * Opening a section keeps its PDF on this device, so it reopens with no
 * signal. The list itself is cached too; offline, the cached list is shown.
 */
export function CaSpecList() {
  const { projectNumber } = useCaProject();
  const [sections, setSections] = useState<CaSpecSection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasSource, setHasSource] = useState(true);
  const [onDevice, setOnDevice] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);

  /** Reads the server's list (mirroring it on the device), or the device's copy when offline. */
  const read = useCallback(async () => {
    let state: { sections: CaSpecSection[]; syncing: boolean; hasSource: boolean; offline: boolean };
    try {
      const result = await fetchSpecSections(projectNumber);
      await mirrorSpecSections(projectNumber, result.sections).catch(() => undefined);
      state = { ...result, offline: false };
    } catch (error) {
      if (!isNetworkFailure(error)) notifyError("Could not load the specifications", error);
      // No connection (or the server failed): show what this device has.
      const cached = await listCachedSpecSections(projectNumber).catch(() => []);
      state = { sections: cached, syncing: false, hasSource: true, offline: isNetworkFailure(error) };
    }
    const fileIds = await cachedSpecFileIds(projectNumber).catch(() => new Set<string>());
    return { ...state, fileIds };
  }, [projectNumber]);

  const apply = useCallback((state: Awaited<ReturnType<typeof read>>) => {
    setSections(state.sections);
    setSyncing(state.syncing);
    setHasSource(state.hasSource);
    setOffline(state.offline);
    setOnDevice(state.fileIds);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    void read().then((state) => active && apply(state));
    return () => {
      active = false;
    };
  }, [read, apply]);

  // While the server is still copying (a first sync of a whole project manual), ask again.
  useEffect(() => {
    if (!syncing) return;
    let active = true;
    const timer = setTimeout(() => void read().then((state) => active && apply(state)), SYNC_POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [syncing, read, apply]);

  const groups = useMemo(
    () => groupByDivision(sections.filter((s) => specSectionMatches(s, search))),
    [sections, search],
  );

  async function checkForUpdates() {
    try {
      await checkSpecUpdates(projectNumber);
      setSyncing(true);
    } catch (error) {
      notifyError("Could not check for updates", error);
    }
  }

  async function open(section: CaSpecSection) {
    // Opened inside the click: a window opened after an await is blocked as a popup.
    const tab = window.open("", "_blank");
    setOpening(section.id);
    try {
      let blob = await cachedSpecFile(section.id);
      if (!blob) {
        const { url } = await fetchSpecSection(projectNumber, section.id);
        blob = await apiGetBlob(url);
        await storeSpecFile(section, blob);
        setOnDevice((prev) => new Set(prev).add(section.id));
      }
      const objectUrl = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "application/pdf" }));
      if (tab) {
        tab.location.href = objectUrl;
      } else {
        // Pop-ups blocked: open in this tab instead.
        window.location.assign(objectUrl);
      }
    } catch (error) {
      tab?.close();
      if (isNetworkFailure(error)) {
        notifyError(
          "This section has not been opened on this device yet",
          new Error("Open it once while online to keep it for offline use."),
        );
      } else {
        notifyError("Could not open the section", error);
      }
    } finally {
      setOpening(null);
    }
  }

  const toggle = (division: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(division)) next.delete(division);
      else next.add(division);
      return next;
    });

  if (!loaded) {
    return (
      <HStack gap="3" py="8" justify="center">
        <Spinner size="sm" color="brand.solid" />
        <Text color="fg.muted">Loading specifications…</Text>
      </HStack>
    );
  }

  return (
    <Stack gap="4">
      <HStack gap="3" wrap="wrap">
        <Input
          size="lg"
          maxW={{ base: "full", md: "sm" }}
          placeholder="Search by number or title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Text fontSize="sm" color="fg.muted" flex="1">
          {offline
            ? "Offline — showing specifications on this device."
            : syncing
              ? "Getting the latest from the CA application…"
              : `${sections.length} section${sections.length === 1 ? "" : "s"}`}
        </Text>
        {!offline && hasSource && (
          <Button variant="outline" size="md" onClick={checkForUpdates} loading={syncing} loadingText="Checking">
            <LuRefreshCw /> Check for updates
          </Button>
        )}
      </HStack>

      {sections.length === 0 ? (
        <Box borderWidth="1px" borderRadius="lg" p="6">
          <Text fontWeight="semibold">No specifications yet.</Text>
          <Text color="fg.muted" fontSize="sm">
            {hasSource
              ? "Specifications appear here once a Project Coordinator publishes them in the CA application's Document Control."
              : "No Document Control source is connected."}
          </Text>
        </Box>
      ) : groups.length === 0 ? (
        <Text color="fg.muted">No sections match “{search}”.</Text>
      ) : (
        groups.map(([division, items]) => {
          const isCollapsed = !search.trim() && collapsed.has(division);
          return (
            <Box key={division} borderWidth="1px" borderRadius="lg" overflow="hidden">
              <Button
                variant="ghost"
                w="full"
                justifyContent="flex-start"
                borderRadius="0"
                bg="bg.muted"
                onClick={() => toggle(division)}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <LuChevronRight /> : <LuChevronDown />}
                <Text fontWeight="semibold" truncate>
                  {divisionLabel(division)}
                </Text>
                <Text color="fg.muted" fontWeight="normal">
                  {items.length}
                </Text>
              </Button>
              {!isCollapsed && (
                <Stack gap="0">
                  {items.map((section) => (
                    <Button
                      key={section.id}
                      variant="ghost"
                      h="auto"
                      py="3"
                      px="4"
                      borderRadius="0"
                      borderTopWidth="1px"
                      justifyContent="flex-start"
                      textAlign="left"
                      onClick={() => open(section)}
                      loading={opening === section.id}
                    >
                      <LuFileText aria-hidden />
                      <Stack gap="0" flex="1" minW="0">
                        <HStack gap="2" wrap="wrap">
                          <Text fontFamily="mono" fontSize="sm" color="fg.muted">
                            {section.sectionNumber}
                          </Text>
                          <Text fontWeight="semibold" truncate>
                            {section.title}
                          </Text>
                        </HStack>
                        <Text fontSize="xs" color="fg.muted" fontWeight="normal">
                          {section.revisionLabel || `Rev ${formatSpecRevision(section.revision)}`}
                        </Text>
                      </Stack>
                      {onDevice.has(section.id) && (
                        <Badge variant="subtle" colorPalette="green" title="Opens without a connection">
                          <LuDownload aria-hidden /> On device
                        </Badge>
                      )}
                    </Button>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })
      )}
    </Stack>
  );
}
