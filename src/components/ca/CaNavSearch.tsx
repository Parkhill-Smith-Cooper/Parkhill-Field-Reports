"use client";

import { Box, IconButton, Input, InputGroup, Spinner, Stack, Text } from "@chakra-ui/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LuFileText, LuFolder, LuSearch, LuX } from "react-icons/lu";

import { listAllLocalDrafts } from "@/lib/ca/offline/draftStore";
import { getCachedProjects, isNetworkFailure } from "@/lib/ca/offline/projectCache";
import { caProjectPath, caReportPath } from "@/lib/ca/routes";
import { CA_SEARCH_MAX, CA_SEARCH_MIN } from "@/lib/ca/search";
import { CA_HOME } from "@/lib/navigation";
import { searchCa } from "@/services/ca/searchService";
import { CA_DISCIPLINE_LABELS, type CaProject, type CaSearchReport } from "@/types/ca";

const DEBOUNCE_MS = 250;

type Result =
  | { kind: "project"; key: string; href: string; project: CaProject }
  | { kind: "report"; key: string; href: string; report: CaSearchReport | LocalReportHit };

/** A draft on this device that has not synced yet (offline search). */
type LocalReportHit = {
  id: string;
  projectNumber: string;
  projectName: string;
  reportNumber: null;
  discipline?: CaSearchReport["discipline"];
  createdByName?: string;
};

const includes = (value: string | undefined | null, q: string) => Boolean(value?.toLowerCase().includes(q));

/** Offline: search the projects and drafts saved on this device. */
async function searchOnDevice(q: string): Promise<Result[]> {
  const [projects, drafts] = await Promise.all([getCachedProjects(), listAllLocalDrafts().catch(() => [])]);
  const names = new Map(projects.map((p) => [p.projectNumber, p.name]));
  const projectHits: Result[] = projects
    .filter((p) => [p.projectNumber, p.name, p.client].some((v) => includes(v, q)))
    .slice(0, 20)
    .map((p) => ({ kind: "project", key: `p:${p.projectNumber}`, href: caProjectPath(p.projectNumber), project: p }));
  const reportHits: Result[] = drafts
    .filter((d) =>
      [d.projectNumber, names.get(d.projectNumber), d.createdByName, d.discipline, d.content.projectName].some((v) =>
        includes(v, q),
      ),
    )
    .slice(0, 20)
    .map((d) => ({
      kind: "report",
      key: `r:${d.id}`,
      href: caReportPath(d.projectNumber, d.id),
      report: {
        id: d.id,
        projectNumber: d.projectNumber,
        projectName: names.get(d.projectNumber) ?? d.content.projectName,
        reportNumber: null,
        discipline: d.discipline,
        createdByName: d.createdByName,
      },
    }));
  return [...projectHits, ...reportHits];
}

/**
 * Nav-bar search for CA Field Reports: projects (number, name, client) and
 * reports in every project (number, who started it, discipline, project).
 * Shown only on CA pages, so CX is unchanged. On phones it is an icon that
 * opens a full-width search row. Offline, it searches what is saved on this
 * device.
 */
export function CaNavSearch() {
  const pathname = usePathname();
  if (!pathname?.startsWith(CA_HOME)) return null;
  return <SearchBox />;
}

function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(false); // phones: the search row is open
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const searchable = q.length >= CA_SEARCH_MIN;

  // Debounced search; only the latest request's answer is shown.
  useEffect(() => {
    if (!searchable) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      searchCa(q).then(
        (found) => {
          if (mine !== seq.current) return;
          setOffline(false);
          setResults([
            ...found.projects.map<Result>((p) => ({
              kind: "project",
              key: `p:${p.projectNumber}`,
              href: caProjectPath(p.projectNumber),
              project: p,
            })),
            ...found.reports.map<Result>((r) => ({
              kind: "report",
              key: `r:${r.id}`,
              href: caReportPath(r.projectNumber, r.id),
              report: r,
            })),
          ]);
          setActive(-1);
          setStatus("done");
        },
        async (error: unknown) => {
          if (mine !== seq.current) return;
          if (!isNetworkFailure(error)) {
            setStatus("error");
            return;
          }
          const local = await searchOnDevice(q);
          if (mine !== seq.current) return;
          setOffline(true);
          setResults(local);
          setActive(-1);
          setStatus("done");
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, searchable]);

  // Close when clicking or tapping outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function change(value: string) {
    setQuery(value);
    setOpen(true);
    if (value.trim().length >= CA_SEARCH_MIN) setStatus("loading");
    else {
      seq.current += 1;
      setResults([]);
      setStatus("idle");
    }
  }

  function go(result: Result) {
    setOpen(false);
    setExpanded(false);
    setQuery("");
    setResults([]);
    setStatus("idle");
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setExpanded(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active >= 0 ? active : 0]);
    }
  }

  const projects = results.filter((r) => r.kind === "project");
  const reports = results.filter((r) => r.kind === "report");
  const showPanel = open && searchable;

  return (
    <Box ref={rootRef} position={{ base: "static", md: "relative" }} flex={{ md: "1" }} maxW={{ md: "md" }} minW="0">
      {/* Phones: an icon that opens the search row. */}
      <IconButton
        display={{ base: expanded ? "none" : "inline-flex", md: "none" }}
        aria-label="Search projects and reports"
        variant="ghost"
        size="lg"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <LuSearch />
      </IconButton>

      <Box
        display={{ base: expanded ? "block" : "none", md: "block" }}
        position={{ base: "absolute", md: "static" }}
        left={{ base: "0", md: "auto" }}
        right={{ base: "0", md: "auto" }}
        top={{ base: "100%", md: "auto" }}
        bg={{ base: "white", md: "transparent" }}
        px={{ base: 4, md: 0 }}
        pb={{ base: 3, md: 0 }}
        boxShadow={{ base: "0 4px 6px rgba(0, 0, 0, 0.06)", md: "none" }}
        zIndex="dropdown"
      >
        <InputGroup
          startElement={<LuSearch />}
          endElement={
            query ? (
              <IconButton aria-label="Clear search" variant="ghost" size="xs" onClick={() => change("")}>
                <LuX />
              </IconButton>
            ) : undefined
          }
        >
          <Input
            ref={inputRef}
            size="lg"
            type="search"
            role="combobox"
            aria-label="Search projects and reports"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            placeholder="Search projects and reports"
            autoComplete="off"
            spellCheck={false}
            maxLength={CA_SEARCH_MAX}
            value={query}
            onChange={(e) => change(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            data-testid="ca-nav-search"
          />
        </InputGroup>

        {showPanel && (
          <Box
            position="absolute"
            left={{ base: 4, md: 0 }}
            right={{ base: 4, md: 0 }}
            mt="1"
            bg="bg"
            borderWidth="1px"
            borderColor="line"
            borderRadius="md"
            boxShadow="lg"
            maxH="70dvh"
            overflowY="auto"
            zIndex="popover"
            data-testid="ca-nav-search-results"
          >
            <Stack as="ul" id={listId} role="listbox" aria-label="Search results" gap="0" listStyleType="none" py="1">
              {status === "loading" && (
                <Box as="li" px="3" py="2" display="flex" gap="2" alignItems="center" color="fg.muted">
                  <Spinner size="xs" /> Searching…
                </Box>
              )}
              {status === "error" && (
                <Text as="li" px="3" py="2" color="fg.muted">
                  Search is not available right now.
                </Text>
              )}
              {status === "done" && results.length === 0 && (
                <Text as="li" px="3" py="2" color="fg.muted">
                  No projects or reports match “{query.trim()}”.
                </Text>
              )}
              {status === "done" && offline && results.length > 0 && (
                <Text as="li" px="3" py="1" fontSize="xs" color="fg.muted">
                  Offline — searching what is saved on this device.
                </Text>
              )}
              {status === "done" && projects.length > 0 && <GroupLabel>Projects</GroupLabel>}
              {status === "done" &&
                projects.map((r) => (
                  <Option key={r.key} id={`${listId}-${results.indexOf(r)}`} active={results.indexOf(r) === active} onPick={() => go(r)}>
                    <LuFolder aria-hidden />
                    {r.kind === "project" && (
                      <Box minW="0">
                        <Text fontWeight="medium" truncate>
                          {r.project.projectNumber} · {r.project.name}
                        </Text>
                        {r.project.client && (
                          <Text fontSize="xs" color="fg.muted" truncate>
                            {r.project.client}
                          </Text>
                        )}
                      </Box>
                    )}
                  </Option>
                ))}
              {status === "done" && reports.length > 0 && <GroupLabel>Reports</GroupLabel>}
              {status === "done" &&
                reports.map((r) => (
                  <Option key={r.key} id={`${listId}-${results.indexOf(r)}`} active={results.indexOf(r) === active} onPick={() => go(r)}>
                    <LuFileText aria-hidden />
                    {r.kind === "report" && (
                      <Box minW="0">
                        <Text fontWeight="medium" truncate>
                          {r.report.reportNumber ? `Report ${r.report.reportNumber}` : "Draft (not synced yet)"}
                          {r.report.discipline ? ` · ${CA_DISCIPLINE_LABELS[r.report.discipline]}` : ""}
                        </Text>
                        <Text fontSize="xs" color="fg.muted" truncate>
                          {r.report.projectNumber} · {r.report.projectName}
                          {r.report.createdByName ? ` · Started by ${r.report.createdByName}` : ""}
                        </Text>
                      </Box>
                    )}
                  </Option>
                ))}
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      as="li"
      role="presentation"
      px="3"
      pt="2"
      pb="1"
      fontSize="xs"
      fontWeight="bold"
      color="fg.muted"
      textTransform="uppercase"
      letterSpacing="wider"
    >
      {children}
    </Text>
  );
}

function Option({
  id,
  active,
  onPick,
  children,
}: {
  id: string;
  active: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Box
      as="li"
      id={id}
      role="option"
      aria-selected={active}
      display="flex"
      alignItems="center"
      gap="2"
      px="3"
      py="2"
      minH="44px"
      cursor="pointer"
      bg={active ? "surface.muted" : undefined}
      _hover={{ bg: "surface.muted" }}
      // Pointer down (not click) so the input's blur never swallows the pick.
      onPointerDown={(event: React.PointerEvent) => {
        event.preventDefault();
        onPick();
      }}
    >
      {children}
    </Box>
  );
}
