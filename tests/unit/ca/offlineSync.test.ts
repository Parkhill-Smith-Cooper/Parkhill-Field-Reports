import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { openCaDb, resetCaDbForTests } from "@/lib/ca/offline/db";
import {
  captureFiles,
  listLocalPhotos,
  pruneSyncedPhotos,
  retryBlocked,
  updateLocalPhoto,
} from "@/lib/ca/offline/photoStore";
import { createPin, listLocalPins, updatePin } from "@/lib/ca/offline/pinStore";
import { backoffMs, createSyncEngine, type SyncTransport } from "@/lib/ca/offline/syncEngine";
import type { PinBody } from "@/services/ca/pinService";

const PROJECT = "MOCK-45371.25.01";

/** Downscaling needs a canvas; in unit tests the "image" is passed through. */
const fakeDownscale = async (file: File) => ({ blob: file as Blob, width: 1600, height: 1200 });
const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 1, 2, 3])], name, { type: "image/jpeg", lastModified: Date.parse("2026-07-14T14:30:00Z") });

function httpError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

/** A fake server that stores photos and pins by id, like the real idempotent PUTs. */
function fakeServer() {
  const photos = new Map<string, { caption: string; hasFile: boolean; puts: number; pinId?: string }>();
  const pins = new Map<string, PinBody & { puts: number }>();
  /** Order in which records arrived, e.g. ["pin:capin_…", "photo:caph_…"]. */
  const arrivals: string[] = [];
  const transport: SyncTransport = {
    async putPin(_project, id, body) {
      const existing = pins.get(id);
      arrivals.push(`pin:${id}`);
      if (!existing || body.clientUpdatedAt > existing.clientUpdatedAt) {
        pins.set(id, { ...body, puts: (existing?.puts ?? 0) + 1 });
      }
      return {};
    },
    async putPhoto(_project, id, meta, file) {
      const existing = photos.get(id);
      if (!existing && !file) throw httpError(409, "include the image");
      arrivals.push(`photo:${id}`);
      photos.set(id, {
        caption: meta.caption,
        hasFile: Boolean(existing?.hasFile || file),
        puts: (existing?.puts ?? 0) + 1,
        pinId: meta.pinId,
      });
      return {};
    },
  };
  return { photos, pins, arrivals, transport };
}

beforeEach(() => {
  // A brand-new, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
  resetCaDbForTests();
});

describe("on-device capture", () => {
  it("saves photos and queues each exactly once", async () => {
    const { saved } = await captureFiles(PROJECT, [jpeg("a.jpg"), jpeg("b.jpg")], { downscale: fakeDownscale });
    expect(saved).toHaveLength(2);
    const local = await listLocalPhotos(PROJECT);
    expect(local.map((p) => p.syncState)).toEqual(["pending", "pending"]);
    expect(local[0].takenAt).toBe("2026-07-14T14:30:00.000Z");

    // Editing a queued photo replaces its outbox entry rather than adding one.
    await updateLocalPhoto(saved[0], { caption: "North wall" });
    await updateLocalPhoto(saved[0], { caption: "North wall, grid 5" });
    expect(await (await openCaDb()).count("outbox")).toBe(2);
  });

  it("reports a failed image without losing the others", async () => {
    const downscale = vi.fn(fakeDownscale).mockRejectedValueOnce(new Error("Unsupported image"));
    const result = await captureFiles(PROJECT, [jpeg("bad.heic"), jpeg("good.jpg")], { downscale });
    expect(result.failed).toEqual([{ name: "bad.heic", error: "Unsupported image" }]);
    expect(result.saved).toHaveLength(1);
  });
});

describe("sync engine", () => {
  it("uploads everything once and marks it synced", async () => {
    const server = fakeServer();
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => true });
    await captureFiles(PROJECT, [jpeg("a.jpg"), jpeg("b.jpg")], { downscale: fakeDownscale });

    await engine.syncNow();

    expect(server.photos.size).toBe(2);
    expect([...server.photos.values()].every((p) => p.hasFile && p.puts === 1)).toBe(true);
    expect((await listLocalPhotos(PROJECT)).map((p) => p.syncState)).toEqual(["synced", "synced"]);
    expect(engine.getSnapshot()).toMatchObject({ phase: "idle", pending: 0, blocked: 0 });
  });

  it("a lost response retries onto the same record: no duplicate", async () => {
    const server = fakeServer();
    let first = true;
    // The server stores the photo, but the response never reaches the phone.
    const flaky: SyncTransport = {
      ...server.transport,
      async putPhoto(...args) {
        await server.transport.putPhoto(...args);
        if (first) {
          first = false;
          throw new TypeError("Failed to fetch");
        }
        return {};
      },
    };
    let clock = 1_000_000;
    const engine = createSyncEngine({ transport: flaky, isOnline: () => true, now: () => clock });
    await captureFiles(PROJECT, [jpeg("a.jpg")], { downscale: fakeDownscale });

    await engine.syncNow();
    expect(engine.getSnapshot().phase).toBe("error");
    expect(engine.getSnapshot().pending).toBe(1);

    clock += backoffMs(1);
    await engine.syncNow();
    expect(server.photos.size).toBe(1);
    expect(engine.getSnapshot()).toMatchObject({ phase: "idle", pending: 0 });
  });

  it("offline: does nothing and says so; data stays queued", async () => {
    const server = fakeServer();
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => false });
    await captureFiles(PROJECT, [jpeg("a.jpg")], { downscale: fakeDownscale });
    await engine.syncNow();
    expect(server.photos.size).toBe(0);
    expect(engine.getSnapshot()).toMatchObject({ phase: "offline", pending: 1 });
  });

  it("an expired session stops the run and keeps everything", async () => {
    const transport: SyncTransport = {
      putPhoto: async () => Promise.reject(httpError(401)),
      putPin: async () => Promise.reject(httpError(401)),
    };
    const engine = createSyncEngine({ transport, isOnline: () => true });
    await captureFiles(PROJECT, [jpeg("a.jpg"), jpeg("b.jpg")], { downscale: fakeDownscale });
    await engine.syncNow();
    expect(engine.getSnapshot()).toMatchObject({ phase: "auth", pending: 2 });
    expect((await listLocalPhotos(PROJECT)).every((p) => p.syncState === "pending")).toBe(true);
  });

  it("a rejected photo is blocked for attention; the rest still sync; retry unblocks", async () => {
    const server = fakeServer();
    let reject = true;
    const engine = createSyncEngine({
      isOnline: () => true,
      transport: {
        ...server.transport,
        async putPhoto(project, id, meta, file) {
          if (reject && meta.fileName === "bad.jpg") throw httpError(415, "Photos must be JPEG.");
          return server.transport.putPhoto(project, id, meta, file);
        },
      },
    });
    await captureFiles(PROJECT, [jpeg("bad.jpg"), jpeg("good.jpg")], { downscale: fakeDownscale });
    await engine.syncNow();

    expect(server.photos.size).toBe(1);
    expect(engine.getSnapshot()).toMatchObject({ phase: "error", blocked: 1, pending: 0 });
    const bad = (await listLocalPhotos(PROJECT)).find((p) => p.fileName === "bad.jpg");
    expect(bad).toMatchObject({ syncState: "error", lastError: "Photos must be JPEG." });

    reject = false;
    await retryBlocked();
    await engine.syncNow();
    expect(server.photos.size).toBe(2);
    expect(engine.getSnapshot()).toMatchObject({ phase: "idle", blocked: 0 });
  });

  it("caption edits after upload send metadata only", async () => {
    const server = fakeServer();
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => true });
    const { saved } = await captureFiles(PROJECT, [jpeg("a.jpg")], { downscale: fakeDownscale });
    await engine.syncNow();

    const put = vi.spyOn(server.transport, "putPhoto");
    await updateLocalPhoto(saved[0], { caption: "Exposed rebar" });
    await engine.syncNow();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][3]).toBeUndefined(); // no file re-sent
    expect(server.photos.get(saved[0])?.caption).toBe("Exposed rebar");
  });

  it("an edit made during an upload is not lost", async () => {
    const server = fakeServer();
    let photoId = "";
    let editDuringUpload = true;
    const engine = createSyncEngine({
      isOnline: () => true,
      transport: {
        ...server.transport,
        async putPhoto(...args) {
          const result = await server.transport.putPhoto(...args);
          if (editDuringUpload) {
            editDuringUpload = false;
            await updateLocalPhoto(photoId, { caption: "edited mid-flight" });
          }
          return result;
        },
      },
    });
    photoId = (await captureFiles(PROJECT, [jpeg("a.jpg")], { downscale: fakeDownscale })).saved[0];
    await engine.syncNow();
    expect(server.photos.get(photoId)?.caption).toBe("edited mid-flight");
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it("concurrent sync calls share one pass", async () => {
    const server = fakeServer();
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => true });
    await captureFiles(PROJECT, [jpeg("a.jpg")], { downscale: fakeDownscale });
    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()]);
    expect([...server.photos.values()][0].puts).toBe(1);
  });

  it("backs off exponentially up to five minutes", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([5_000, 10_000, 20_000]);
    expect(backoffMs(30)).toBe(300_000);
  });
});

describe("pins", () => {
  it("a pin and the photos taken into it sync once each, pin first", async () => {
    const server = fakeServer();
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => true });
    const pin = await createPin(PROJECT, { drawingId: "cadwg_1", x: 0.25, y: 0.75 });
    const { saved } = await captureFiles(PROJECT, [jpeg("a.jpg"), jpeg("b.jpg")], {
      pinId: pin.id,
      downscale: fakeDownscale,
    });

    await engine.syncNow();
    await engine.syncNow(); // a second pass sends nothing new

    expect(server.pins.get(pin.id)).toMatchObject({ x: 0.25, y: 0.75, puts: 1 });
    expect(saved.map((id) => server.photos.get(id)?.pinId)).toEqual([pin.id, pin.id]);
    expect(server.arrivals[0]).toBe(`pin:${pin.id}`);
    expect(server.arrivals).toHaveLength(3);
    expect((await listLocalPins(PROJECT))[0].syncState).toBe("synced");
  });

  it("edits and a deletion made offline go out as the latest version only", async () => {
    const server = fakeServer();
    let online = false;
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => online });
    const pin = await createPin(PROJECT, { drawingId: "cadwg_1", x: 0.1, y: 0.1 });
    await updatePin(pin.id, { label: "Mech room" });
    await updatePin(pin.id, { deleted: true });
    expect(await (await openCaDb()).count("outbox")).toBe(1);

    await engine.syncNow();
    expect(server.pins.size).toBe(0);

    online = true;
    await engine.syncNow();
    expect(server.pins.get(pin.id)).toMatchObject({ label: "Mech room", deleted: true, puts: 1 });
  });

  it("clamps pins to the sheet", async () => {
    const pin = await createPin(PROJECT, { drawingId: "cadwg_1", x: 1.4, y: -0.2 });
    expect([pin.x, pin.y]).toEqual([1, 0]);
  });
});

describe("housekeeping", () => {
  it("prunes only old, synced photos", async () => {
    const server = fakeServer();
    const engine = createSyncEngine({ transport: server.transport, isOnline: () => true });
    await captureFiles(PROJECT, [jpeg("old.jpg")], { downscale: fakeDownscale });
    await engine.syncNow();
    await captureFiles(PROJECT, [jpeg("unsynced.jpg")], { downscale: fakeDownscale });

    const in31Days = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(await pruneSyncedPhotos(in31Days)).toBe(1);
    expect((await listLocalPhotos(PROJECT)).map((p) => p.fileName)).toEqual(["unsynced.jpg"]);
  });
});
