import "server-only";

import { CaConflictError, type CaRepository } from "@/lib/ca/contracts";
import { formatReportNumber } from "@/lib/ca/reportContent";
import { RevisionAlreadyExistsError } from "@/lib/ca/revisions";
import type {
  CaDrawing,
  CaPhoto,
  CaPin,
  CaProject,
  CaReport,
  CaReportRevision,
} from "@/types/ca";

/**
 * AZURE CA repository (Cosmos DB, NoSQL API).
 *
 * BUILT AND UNIT-TESTED AGAINST AN IN-MEMORY STAND-IN ONLY. It has never been
 * run against a real Cosmos account. Marcelo: provision the containers below,
 * then run it against a non-production account first (see
 * docs/ca-integration-contracts.md, "Azure").
 *
 * Containers (names from src/lib/ca/config.ts), all partitioned on
 * `/projectNumber`, so every read and query stays within one partition:
 *
 * | Container   | Documents (`type`)                                        |
 * | ----------- | --------------------------------------------------------- |
 * | caProjects  | project (id = projectNumber)                              |
 * | caCapture   | photo, pin (id = device-generated id)                     |
 * | caDrawings  | drawing                                                   |
 * | caReports   | report, revision (id = `{reportId}_r{n}`), counter        |
 *
 * Semantics match the mock repository exactly (same unit tests):
 * - idempotent upserts keyed by device-generated ids; the newer
 *   `clientUpdatedAt` wins, enforced with ETag-conditional replaces;
 * - revisions are written with `create` only (409 → RevisionAlreadyExists);
 * - report numbers come from a per-project counter document updated with
 *   optimistic concurrency. A crash between taking a number and creating the
 *   report can skip a number; numbers are never reused.
 */

/** The small part of the @azure/cosmos `Container` this repository uses. */
export type CosmosContainerLike = {
  item(
    id: string,
    partitionKey: string,
  ): {
    read<T>(): Promise<{ resource?: T & CosmosMeta; statusCode?: number }>;
    replace<T>(body: T, options?: { accessCondition?: { type: "IfMatch"; condition: string } }): Promise<{ resource?: T & CosmosMeta }>;
    delete(): Promise<unknown>;
  };
  items: {
    create<T>(body: T): Promise<{ resource?: T & CosmosMeta }>;
    query<T>(
      spec: { query: string; parameters: { name: string; value: string }[] },
      options?: { partitionKey?: string },
    ): { fetchAll(): Promise<{ resources: T[] }> };
  };
};

type CosmosMeta = { _etag?: string; _rid?: string; _self?: string; _ts?: number; _attachments?: string };
type Typed<T> = T & { type: string };

export type CaCosmosContainers = {
  projects: CosmosContainerLike;
  capture: CosmosContainerLike;
  drawings: CosmosContainerLike;
  reports: CosmosContainerLike;
};

const MAX_RETRIES = 5;

function status(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Number((error as { code: unknown }).code);
    return Number.isNaN(code) ? undefined : code;
  }
  return undefined;
}

/** Removes Cosmos system properties and the internal `type` discriminator. */
function clean<T>(doc: (T & CosmosMeta & { type?: string }) | undefined): T | null {
  if (!doc) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _etag, _rid, _self, _ts, _attachments, type, ...rest } = doc;
  return rest as T;
}

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

async function read<T>(c: CosmosContainerLike, id: string, pk: string) {
  try {
    const { resource } = await c.item(id, pk).read<T>();
    return resource ?? null;
  } catch (error) {
    if (status(error) === 404) return null;
    throw error;
  }
}

async function listByType<T>(c: CosmosContainerLike, projectNumber: string, type: string): Promise<T[]> {
  const { resources } = await c.items
    .query<T & CosmosMeta & { type: string }>(
      {
        query: "SELECT * FROM c WHERE c.projectNumber = @p AND c.type = @t",
        parameters: [
          { name: "@p", value: projectNumber },
          { name: "@t", value: type },
        ],
      },
      { partitionKey: projectNumber },
    )
    .fetchAll();
  return resources.map((r) => clean<T>(r)!);
}

/**
 * Read-modify-write with optimistic concurrency. `change` returns the new
 * document, or null to keep the current one. Retries on a lost race (412).
 */
async function update<T extends { id: string; projectNumber: string }>(
  c: CosmosContainerLike,
  id: string,
  pk: string,
  change: (current: T) => T | null,
): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await read<Typed<T>>(c, id, pk);
    if (!current) return null;
    const next = change(clean<T>(current)!);
    if (!next) return clean<T>(current);
    try {
      const { resource } = await c.item(id, pk).replace<Typed<T>>(
        { ...next, type: current.type },
        current._etag ? { accessCondition: { type: "IfMatch", condition: current._etag } } : undefined,
      );
      return clean<T>(resource) ?? next;
    } catch (error) {
      if (status(error) === 412) continue;
      throw error;
    }
  }
  throw new CaConflictError("The record kept changing while saving. Try again.");
}

/** Create-or-update where the newer `clientUpdatedAt` wins. */
async function upsertNewerWins<T extends { id: string; projectNumber: string; clientUpdatedAt: string }>(
  c: CosmosContainerLike,
  type: string,
  doc: T,
  merge: (existing: T, incoming: T) => T,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const existing = await read<Typed<T>>(c, doc.id, doc.projectNumber);
    if (!existing) {
      try {
        const { resource } = await c.items.create<Typed<T>>({ ...doc, type });
        return clean<T>(resource) ?? doc;
      } catch (error) {
        if (status(error) === 409) continue; // created concurrently: re-read
        throw error;
      }
    }
    const current = clean<T>(existing)!;
    if (!newer(doc.clientUpdatedAt, current.clientUpdatedAt)) return current;
    const result = await update<T>(c, doc.id, doc.projectNumber, (latest) =>
      newer(doc.clientUpdatedAt, latest.clientUpdatedAt) ? merge(latest, doc) : null,
    );
    if (result) return result;
  }
  throw new CaConflictError("The record kept changing while saving. Try again.");
}

async function deleteAllInPartition(c: CosmosContainerLike, projectNumber: string): Promise<void> {
  const { resources } = await c.items
    .query<{ id: string }>(
      { query: "SELECT c.id FROM c WHERE c.projectNumber = @p", parameters: [{ name: "@p", value: projectNumber }] },
      { partitionKey: projectNumber },
    )
    .fetchAll();
  for (const { id } of resources) {
    try {
      await c.item(id, projectNumber).delete();
    } catch (error) {
      if (status(error) !== 404) throw error;
    }
  }
}

export function createCosmosCaRepository(containers: CaCosmosContainers): CaRepository {
  const { projects, capture, drawings, reports } = containers;
  const now = () => new Date().toISOString();

  async function getReport(projectNumber: string, reportId: string): Promise<CaReport | null> {
    const doc = await read<Typed<CaReport>>(reports, reportId, projectNumber);
    return doc && doc.type === "report" ? clean<CaReport>(doc) : null;
  }

  async function nextReportNumber(projectNumber: string): Promise<string> {
    const id = "reportCounter";
    for (let attempt = 0; attempt < MAX_RETRIES * 2; attempt++) {
      const counter = await read<{ id: string; projectNumber: string; type: string; value: number }>(reports, id, projectNumber);
      if (!counter) {
        try {
          await reports.items.create({ id, projectNumber, type: "counter", value: 1 });
          return formatReportNumber(1);
        } catch (error) {
          if (status(error) === 409) continue;
          throw error;
        }
      }
      try {
        const value = counter.value + 1;
        await reports
          .item(id, projectNumber)
          .replace(
            { id, projectNumber, type: "counter", value },
            counter._etag ? { accessCondition: { type: "IfMatch", condition: counter._etag } } : undefined,
          );
        return formatReportNumber(value);
      } catch (error) {
        if (status(error) === 412) continue;
        throw error;
      }
    }
    throw new CaConflictError("Could not assign a report number. Try again.");
  }

  return {
    kind: "azure",

    projects: {
      async list() {
        const { resources } = await projects.items
          .query<CaProject & CosmosMeta & { type: string }>({
            query: "SELECT * FROM c WHERE c.type = 'project'",
            parameters: [],
          })
          .fetchAll();
        return resources.map((r) => clean<CaProject>(r)!).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async get(projectNumber) {
        return clean<CaProject>((await read<CaProject>(projects, projectNumber, projectNumber)) ?? undefined);
      },
      async create(input, createdBy) {
        const stamp = now();
        const project: CaProject = {
          id: input.projectNumber,
          projectNumber: input.projectNumber,
          name: input.name,
          client: input.client ?? "",
          source: input.source,
          ...(input.externalRef ? { externalRef: input.externalRef } : {}),
          createdAt: stamp,
          createdBy,
          updatedAt: stamp,
        };
        try {
          await projects.items.create({ ...project, type: "project" });
        } catch (error) {
          if (status(error) === 409) {
            throw new CaConflictError(`Project ${input.projectNumber} is already set up in CA Field Reports.`);
          }
          throw error;
        }
        return project;
      },
      async update(projectNumber, patch) {
        return update<CaProject>(projects, projectNumber, projectNumber, (p) => ({ ...p, ...patch, updatedAt: now() }));
      },
      async delete(projectNumber) {
        if (!(await read(projects, projectNumber, projectNumber))) return false;
        // Child records first, the project last, so a failure part-way leaves
        // the project visible and the delete can simply be retried. The API
        // refuses this for projects with issued reports (revisions are kept).
        await deleteAllInPartition(capture, projectNumber);
        await deleteAllInPartition(drawings, projectNumber);
        await deleteAllInPartition(reports, projectNumber);
        await projects.item(projectNumber, projectNumber).delete();
        return true;
      },
    },

    photos: {
      async list(projectNumber) {
        return (await listByType<CaPhoto>(capture, projectNumber, "photo")).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
      },
      async get(projectNumber, photoId) {
        const doc = await read<Typed<CaPhoto>>(capture, photoId, projectNumber);
        return doc && doc.type === "photo" ? clean<CaPhoto>(doc) : null;
      },
      upsert(photo) {
        // The file path and creation metadata are fixed at first write.
        return upsertNewerWins<CaPhoto>(capture, "photo", photo, (existing, incoming) => ({
          ...existing,
          caption: incoming.caption,
          pinId: incoming.pinId,
          deleted: incoming.deleted,
          clientUpdatedAt: incoming.clientUpdatedAt,
        }));
      },
    },

    pins: {
      async list(projectNumber) {
        return (await listByType<CaPin>(capture, projectNumber, "pin")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      upsert(pin) {
        return upsertNewerWins<CaPin>(capture, "pin", pin, (existing, incoming) => ({
          ...incoming,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
        }));
      },
    },

    drawings: {
      async list(projectNumber) {
        return (await listByType<CaDrawing>(drawings, projectNumber, "drawing")).sort((a, b) =>
          b.uploadedAt.localeCompare(a.uploadedAt),
        );
      },
      async get(projectNumber, drawingId) {
        return clean<CaDrawing>((await read<CaDrawing>(drawings, drawingId, projectNumber)) ?? undefined);
      },
      async upsert(drawing) {
        const existing = await read<CaDrawing>(drawings, drawing.id, drawing.projectNumber);
        if (!existing) {
          try {
            await drawings.items.create({ ...drawing, type: "drawing" });
            return drawing;
          } catch (error) {
            if (status(error) !== 409) throw error;
          }
        }
        return (await update<CaDrawing>(drawings, drawing.id, drawing.projectNumber, () => drawing)) ?? drawing;
      },
    },

    reports: {
      async list(projectNumber) {
        return (await listByType<CaReport>(reports, projectNumber, "report")).sort((a, b) =>
          b.reportNumber.localeCompare(a.reportNumber),
        );
      },
      get: getReport,
      async create(input) {
        const existing = await getReport(input.projectNumber, input.id);
        if (existing) return existing; // idempotent retry
        const report: CaReport = { ...input, reportNumber: await nextReportNumber(input.projectNumber) };
        try {
          await reports.items.create({ ...report, type: "report" });
          return report;
        } catch (error) {
          if (status(error) === 409) {
            const raced = await getReport(input.projectNumber, input.id);
            if (raced) return raced;
          }
          throw error;
        }
      },
      async saveDraft(projectNumber, reportId, content, clientUpdatedAt) {
        const editedAt = clientUpdatedAt ?? now();
        return update<CaReport>(reports, reportId, projectNumber, (r) =>
          clientUpdatedAt && r.draftUpdatedAt && !newer(clientUpdatedAt, r.draftUpdatedAt)
            ? null
            : { ...r, draft: content, draftUpdatedAt: editedAt, hasUnissuedChanges: r.latestRevision !== null, updatedAt: now() },
        );
      },
      async deleteDraft(projectNumber, reportId) {
        const existing = await getReport(projectNumber, reportId);
        if (!existing) return "missing";
        if (existing.latestRevision !== null) return "issued";
        try {
          await reports.item(reportId, projectNumber).delete();
        } catch (error) {
          if (status(error) !== 404) throw error;
        }
        return "deleted";
      },
      async createRevision(revision) {
        try {
          await reports.items.create({ ...revision, type: "revision" });
          return revision;
        } catch (error) {
          if (status(error) === 409) throw new RevisionAlreadyExistsError(revision.reportId, revision.revision);
          throw error;
        }
      },
      async markIssued(projectNumber, reportId, revision) {
        return update<CaReport>(reports, reportId, projectNumber, (r) => ({
          ...r,
          latestRevision: revision,
          hasUnissuedChanges: false,
          updatedAt: now(),
        }));
      },
      async listRevisions(projectNumber, reportId) {
        return (await listByType<CaReportRevision>(reports, projectNumber, "revision"))
          .filter((r) => r.reportId === reportId)
          .sort((a, b) => b.revision - a.revision);
      },
      async getRevision(projectNumber, reportId, revision) {
        const doc = await read<Typed<CaReportRevision>>(reports, `${reportId}_r${revision}`, projectNumber);
        return doc && doc.type === "revision" ? clean<CaReportRevision>(doc) : null;
      },
    },
  };
}
