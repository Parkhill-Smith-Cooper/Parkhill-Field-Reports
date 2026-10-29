import "server-only";

import { fabricQuery } from "@/lib/azure/fabricSql";
import { env } from "@/lib/env";
import type { VantagePointProject } from "@/types";

/**
 * VantagePoint projects, read from Fabric. Nothing in this app writes there;
 * the data team syncs it from VantagePoint nightly.
 */

// Identifiers cannot be bound as parameters, so the configured table name is
// validated and bracket-quoted instead.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function projectsTable(): string {
  const raw = env.fabricProjectsTable.trim();
  return raw
    .split(".")
    .map((part) => {
      const name = part.replace(/^\[|\]$/g, "");
      if (!IDENTIFIER.test(name)) {
        throw new Error(
          `FABRIC_PROJECTS_TABLE must be [schema.]table; got ${JSON.stringify(raw)}`,
        );
      }
      return `[${name}]`;
    })
    .join(".");
}

/**
 * Active, top-level projects only - the same set parkhill-ccr offers. Deltek
 * stores one row per WBS level, so without the `WBS2`/`WBS3` filter every
 * phase and task would appear as its own project. Columns are RTRIMmed because
 * Deltek keys are fixed-width.
 */
const PROJECTS_QUERY = () => `
  SELECT RTRIM(WBS1) AS projectNumber,
         RTRIM(Name) AS name
    FROM ${projectsTable()}
   WHERE Status = 'A' AND WBS2 = ' ' AND WBS3 = ' '
   ORDER BY WBS1
`;

// A lakehouse scan takes a few seconds whatever the query and the source only
// changes nightly, so the list is reused rather than fetched per dialog open.
const CACHE_TTL_MS = 15 * 60 * 1000;

declare global {
  var __cxFieldVantagePointCache:
    | { projects: VantagePointProject[]; expires: number }
    | undefined;
}

export async function listVantagePointProjects(): Promise<VantagePointProject[]> {
  const cached = globalThis.__cxFieldVantagePointCache;
  if (cached && cached.expires > Date.now()) return cached.projects;

  const projects = await fabricQuery<VantagePointProject>(PROJECTS_QUERY());
  globalThis.__cxFieldVantagePointCache = {
    projects,
    expires: Date.now() + CACHE_TTL_MS,
  };
  return projects;
}
