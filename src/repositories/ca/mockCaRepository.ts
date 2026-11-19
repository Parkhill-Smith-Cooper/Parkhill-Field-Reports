import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  CaConflictError,
  type CaRepository,
} from "@/lib/ca/contracts";
import { formatReportNumber } from "@/lib/ca/reportContent";
import { applyIssueMark, RevisionAlreadyExistsError } from "@/lib/ca/revisions";
import { byRecentActivity, reportMatches } from "@/lib/ca/search";
import type {
  CaDrawing,
  CaDrawingSet,
  CaPhoto,
  CaPin,
  CaProject,
  CaReport,
  CaReportRevision,
} from "@/types/ca";

/**
 * MOCK CA repository — development and tests only.
 *
 * Holds every CA record in memory and, when given a directory, mirrors it to
 * `<dir>/db.json` after each write so data survives a dev-server restart.
 * Nothing here talks to Azure or to any Parkhill system. The UI shows a
 * "MOCK DATA" banner whenever this implementation is active.
 *
 * It implements the same semantics the Azure implementation must keep
 * (idempotent upserts, newer-edit-wins, create-only revisions), so the
 * behaviour the app is tested against is the behaviour it gets in Azure.
 */

type Db = {
  projects: Record<string, CaProject>;
  photos: Record<string, Record<string, CaPhoto>>;
  pins: Record<string, Record<string, CaPin>>;
  drawings: Record<string, Record<string, CaDrawing>>;
  drawingSets: Record<string, Record<string, CaDrawingSet>>;
  reports: Record<string, Record<string, CaReport>>;
  revisions: Record<string, Record<string, CaReportRevision>>;
};

function emptyDb(): Db {
  return {
    projects: {},
    photos: {},
    pins: {},
    drawings: {},
    drawingSets: {},
    reports: {},
    revisions: {},
  };
}

function load(file: string | null): Db {
  if (!file || !fs.existsSync(file)) return emptyDb();
  try {
    return { ...emptyDb(), ...(JSON.parse(fs.readFileSync(file, "utf8")) as Db) };
  } catch (error) {
    console.warn(`[CA mock] Could not read ${file}; starting empty.`, error);
    return emptyDb();
  }
}

/** Copies on the way in and out, so callers can never mutate stored state. */
const clone = <T>(value: T): T => structuredClone(value);

function bucket<T>(
  table: Record<string, Record<string, T>>,
  projectNumber: string,
): Record<string, T> {
  table[projectNumber] ??= {};
  return table[projectNumber];
}

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

export function createMockCaRepository(options: {
  /** Directory to persist to, or `null` for memory only (tests). */
  dataDir: string | null;
}): CaRepository {
  const file = options.dataDir ? path.join(options.dataDir, "db.json") : null;
  const db = load(file);

  function persist() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write-then-rename so a crash mid-write cannot leave a truncated file.
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  const now = () => new Date().toISOString();

  return {
    kind: "mock",

    projects: {
      async list() {
        return Object.values(db.projects)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(clone);
      },
      async get(projectNumber) {
        const project = db.projects[projectNumber];
        return project ? clone(project) : null;
      },
      async create(input, createdBy) {
        if (db.projects[input.projectNumber]) {
          throw new CaConflictError(
            `Project ${input.projectNumber} is already set up in CA Field Reports.`,
          );
        }
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
        db.projects[project.projectNumber] = project;
        persist();
        return clone(project);
      },
      async update(projectNumber, patch) {
        const existing = db.projects[projectNumber];
        if (!existing) return null;
        const updated: CaProject = { ...existing, ...patch, updatedAt: now() };
        db.projects[projectNumber] = updated;
        persist();
        return clone(updated);
      },
      async delete(projectNumber) {
        if (!db.projects[projectNumber]) return false;
        delete db.projects[projectNumber];
        delete db.photos[projectNumber];
        delete db.pins[projectNumber];
        delete db.drawings[projectNumber];
        delete db.drawingSets[projectNumber];
        delete db.reports[projectNumber];
        delete db.revisions[projectNumber];
        persist();
        return true;
      },
    },

    photos: {
      async list(projectNumber) {
        return Object.values(db.photos[projectNumber] ?? {})
          .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
          .map(clone);
      },
      async get(projectNumber, photoId) {
        const photo = db.photos[projectNumber]?.[photoId];
        return photo ? clone(photo) : null;
      },
      async upsert(photo) {
        const table = bucket(db.photos, photo.projectNumber);
        const existing = table[photo.id];
        if (existing && !newer(photo.clientUpdatedAt, existing.clientUpdatedAt)) {
          // A retry, or an older edit arriving late: keep what we have.
          return clone(existing);
        }
        // The file path and creation metadata are fixed at first write.
        table[photo.id] = existing
          ? {
              ...existing,
              caption: photo.caption,
              pinId: photo.pinId,
              deleted: photo.deleted,
              clientUpdatedAt: photo.clientUpdatedAt,
            }
          : clone(photo);
        persist();
        return clone(table[photo.id]);
      },
    },

    pins: {
      async list(projectNumber) {
        return Object.values(db.pins[projectNumber] ?? {})
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(clone);
      },
      async upsert(pin) {
        const table = bucket(db.pins, pin.projectNumber);
        const existing = table[pin.id];
        if (existing && !newer(pin.clientUpdatedAt, existing.clientUpdatedAt)) {
          return clone(existing);
        }
        table[pin.id] = existing
          ? { ...clone(pin), createdAt: existing.createdAt, createdBy: existing.createdBy }
          : clone(pin);
        persist();
        return clone(table[pin.id]);
      },
    },

    drawings: {
      async list(projectNumber) {
        return Object.values(db.drawings[projectNumber] ?? {})
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
          .map(clone);
      },
      async get(projectNumber, drawingId) {
        const drawing = db.drawings[projectNumber]?.[drawingId];
        return drawing ? clone(drawing) : null;
      },
      async upsert(drawing) {
        bucket(db.drawings, drawing.projectNumber)[drawing.id] = clone(drawing);
        persist();
        return clone(drawing);
      },
    },

    drawingSets: {
      async list(projectNumber) {
        return Object.values(db.drawingSets[projectNumber] ?? {})
          .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
          .map(clone);
      },
      async get(projectNumber, setId) {
        const set = db.drawingSets[projectNumber]?.[setId];
        return set ? clone(set) : null;
      },
      async create(set) {
        const table = bucket(db.drawingSets, set.projectNumber);
        if (table[set.id]) return clone(table[set.id]);
        table[set.id] = clone(set);
        persist();
        return clone(set);
      },
      async updateSheets(projectNumber, setId, change) {
        const existing = db.drawingSets[projectNumber]?.[setId];
        if (!existing) return null;
        existing.sheets = clone(change(clone(existing.sheets)));
        persist();
        return clone(existing);
      },
      async remove(projectNumber, setId, removedBy) {
        const existing = db.drawingSets[projectNumber]?.[setId];
        if (!existing) return null;
        if (!existing.removed) {
          Object.assign(existing, { removed: true, removedAt: now(), removedBy });
          persist();
        }
        return clone(existing);
      },
    },

    reports: {
      async list(projectNumber) {
        return Object.values(db.reports[projectNumber] ?? {})
          .sort((a, b) => b.reportNumber.localeCompare(a.reportNumber))
          .map(clone);
      },
      async search(query, limit) {
        return Object.values(db.reports)
          .flatMap((table) => Object.values(table))
          .filter((r) => reportMatches(r, query))
          .sort(byRecentActivity)
          .slice(0, limit)
          .map(clone);
      },
      async get(projectNumber, reportId) {
        const report = db.reports[projectNumber]?.[reportId];
        return report ? clone(report) : null;
      },
      async create(input) {
        const table = bucket(db.reports, input.projectNumber);
        if (table[input.id]) return clone(table[input.id]);
        const highest = Object.values(table).reduce(
          (max, r) => Math.max(max, Number.parseInt(r.reportNumber, 10) || 0),
          0,
        );
        const report: CaReport = {
          ...clone(input),
          reportNumber: formatReportNumber(highest + 1),
        };
        table[report.id] = report;
        persist();
        return clone(report);
      },
      async saveDraft(projectNumber, reportId, content, clientUpdatedAt) {
        const existing = db.reports[projectNumber]?.[reportId];
        if (!existing) return null;
        const editedAt = clientUpdatedAt ?? now();
        if (clientUpdatedAt && existing.draftUpdatedAt && !newer(clientUpdatedAt, existing.draftUpdatedAt)) {
          return clone(existing); // a late, older edit: keep the newer draft
        }
        const updated: CaReport = {
          ...existing,
          draft: clone(content),
          draftUpdatedAt: editedAt,
          hasUnissuedChanges: existing.latestRevision !== null,
          updatedAt: now(),
        };
        db.reports[projectNumber][reportId] = updated;
        persist();
        return clone(updated);
      },
      async deleteDraft(projectNumber, reportId) {
        const existing = db.reports[projectNumber]?.[reportId];
        if (!existing) return "missing";
        if (existing.latestRevision !== null) return "issued";
        delete db.reports[projectNumber][reportId];
        persist();
        return "deleted";
      },
      async createRevision(revision) {
        const table = bucket(db.revisions, revision.projectNumber);
        if (table[revision.id]) {
          throw new RevisionAlreadyExistsError(revision.reportId, revision.revision);
        }
        table[revision.id] = clone(revision);
        persist();
        return clone(revision);
      },
      async markIssued(projectNumber, reportId, revision, issuedDraftUpdatedAt) {
        const existing = db.reports[projectNumber]?.[reportId];
        if (!existing) return null;
        const updated = applyIssueMark(existing, revision, issuedDraftUpdatedAt, now());
        if (!updated) return clone(existing);
        db.reports[projectNumber][reportId] = updated;
        persist();
        return clone(updated);
      },
      async listRevisions(projectNumber, reportId) {
        return Object.values(db.revisions[projectNumber] ?? {})
          .filter((r) => r.reportId === reportId)
          .sort((a, b) => b.revision - a.revision)
          .map(clone);
      },
      async getRevision(projectNumber, reportId, revision) {
        const found = Object.values(db.revisions[projectNumber] ?? {}).find(
          (r) => r.reportId === reportId && r.revision === revision,
        );
        return found ? clone(found) : null;
      },
    },
  };
}
