import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import { openCaDb, resetCaDbForTests } from "@/lib/ca/offline/db";

const DB_NAME = "parkhill-ca-field-reports";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetCaDbForTests();
});

/** The version-1 stores, as every earlier build created them. */
function createV1Stores(db: IDBDatabase) {
  db.createObjectStore("projects", { keyPath: "projectNumber" });
  for (const name of ["photos", "pins", "drawings", "drafts"]) {
    db.createObjectStore(name, { keyPath: "id" }).createIndex("byProject", "projectNumber");
  }
  db.createObjectStore("outbox", { keyPath: "key" });
}

describe("on-device database upgrades", () => {
  it("creates every store on a fresh device", async () => {
    const db = await openCaDb();
    expect([...db.objectStoreNames].sort()).toEqual([
      "drafts",
      "drawingSetIndex",
      "drawings",
      "outbox",
      "photos",
      "pins",
      "projects",
      "specSections",
    ]);
  });

  it("opens a version-2 database (with the retired sheetSets store), keeping data", async () => {
    const old = await openDB(DB_NAME, 2, {
      upgrade(db) {
        createV1Stores(db as unknown as IDBDatabase);
        (db as unknown as IDBDatabase).createObjectStore("sheetSets", { keyPath: "id" });
      },
    });
    await old.put("photos", { id: "caph_1", projectNumber: "MOCK-1" });
    old.close();

    const db = await openCaDb();
    expect(db.version).toBe(5);
    expect([...db.objectStoreNames]).not.toContain("sheetSets");
    expect([...db.objectStoreNames]).toContain("drawingSetIndex");
    expect(await db.get("photos", "caph_1")).toMatchObject({ projectNumber: "MOCK-1" });
  });

  it("opens a version-1 database, keeping data", async () => {
    const old = await openDB(DB_NAME, 1, { upgrade: (db) => createV1Stores(db as unknown as IDBDatabase) });
    await old.put("pins", { id: "capin_1", projectNumber: "MOCK-1" });
    old.close();

    const db = await openCaDb();
    expect(await db.get("pins", "capin_1")).toMatchObject({ projectNumber: "MOCK-1" });
  });

  it("opens a version-3 database, adding the drawing-set index and keeping data", async () => {
    const old = await openDB(DB_NAME, 3, { upgrade: (db) => createV1Stores(db as unknown as IDBDatabase) });
    await old.put("drafts", { id: "carep_1", projectNumber: "MOCK-1" });
    old.close();

    const db = await openCaDb();
    expect(db.version).toBe(5);
    expect(await db.get("drafts", "carep_1")).toMatchObject({ projectNumber: "MOCK-1" });
    await db.put("drawingSetIndex", {
      id: "dcset_1",
      projectNumber: "MOCK-1",
      set: {} as never,
      cachedAt: "2026-11-19T00:00:00.000Z",
    });
    expect(await db.getAllFromIndex("drawingSetIndex", "byProject", "MOCK-1")).toHaveLength(1);
  });

  it("opens a version-4 database, adding the specification store and keeping data", async () => {
    const old = await openDB(DB_NAME, 4, {
      upgrade(db) {
        createV1Stores(db as unknown as IDBDatabase);
        (db as unknown as IDBDatabase).createObjectStore("drawingSetIndex", { keyPath: "id" }).createIndex("byProject", "projectNumber");
      },
    });
    await old.put("drawingSetIndex", { id: "dcset_1", projectNumber: "MOCK-1" });
    old.close();

    const db = await openCaDb();
    expect(db.version).toBe(5);
    expect(await db.get("drawingSetIndex", "dcset_1")).toMatchObject({ projectNumber: "MOCK-1" });
    await db.put("specSections", {
      id: "dcspec_1",
      projectNumber: "MOCK-1",
      section: {} as never,
      blob: null,
      cachedAt: "2026-11-19T00:00:00.000Z",
    });
    expect(await db.getAllFromIndex("specSections", "byProject", "MOCK-1")).toHaveLength(1);
  });
});
