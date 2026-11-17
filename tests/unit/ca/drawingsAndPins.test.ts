import { describe, expect, it } from "vitest";

import { numberPins, pinName } from "@/lib/ca/pins";
import { validateDrawingMeta, validatePin } from "@/lib/ca/validation";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";

import { pin } from "./fixtures";

const meta = (overrides: Record<string, unknown> = {}) => ({
  title: "Level 1 Floor Plan",
  sheetNumber: "A-101",
  originalFileName: "CD set.pdf",
  fileType: "pdf",
  page: 3,
  pageCount: 40,
  width: 4096,
  height: 2731,
  source: "upload",
  ...overrides,
});

describe("drawing upload metadata", () => {
  it("accepts a PDF page and an image", () => {
    expect(validateDrawingMeta(meta())).toBeNull();
    expect(validateDrawingMeta(meta({ fileType: "image", page: 1, pageCount: 1 }))).toBeNull();
  });

  it("rejects bad pages, sizes, sources and missing titles", () => {
    expect(validateDrawingMeta(meta({ page: 41 }))).toMatch(/outside/);
    expect(validateDrawingMeta(meta({ width: 0 }))).toMatch(/width/);
    expect(validateDrawingMeta(meta({ title: "  " }))).toMatch(/title/);
    expect(validateDrawingMeta(meta({ source: "sharepoint" }))).toMatch(/source/);
    // An imported sheet must say which upstream sheet it is.
    expect(validateDrawingMeta(meta({ source: "ca-app" }))).toMatch(/reference/);
    expect(validateDrawingMeta(meta({ source: "ca-app", externalRef: "sheet-1" }))).toBeNull();
  });
});

describe("pins", () => {
  it("validate without a photo list (photos point at pins, not the reverse)", () => {
    expect(validatePin(pin("capin_1"))).toBeNull();
    expect(validatePin({ ...pin("capin_1"), deleted: "yes" })).toMatch(/state/);
  });

  it("are numbered per drawing in drop order, skipping deleted pins", () => {
    const numbers = numberPins([
      pin("b", { createdAt: "2026-07-14T15:00:00Z" }),
      pin("a", { createdAt: "2026-07-14T14:00:00Z" }),
      pin("x", { createdAt: "2026-07-14T14:30:00Z", deleted: true }),
      pin("c", { createdAt: "2026-07-14T13:00:00Z", drawingId: "cadwg_2" }),
    ]);
    expect(Object.fromEntries(numbers)).toEqual({ a: 1, b: 2, c: 1 });
    expect(pinName({ label: "" }, 2)).toBe("Pin 2");
    expect(pinName({ label: "Mech room" }, 2)).toBe("Mech room");
  });

  it("mock store: a stale pin edit never overwrites a newer one; a deletion sticks", async () => {
    const repo = createMockCaRepository({ dataDir: null });
    await repo.pins.upsert(pin("capin_1", { label: "new", clientUpdatedAt: "2026-07-14T15:00:00Z" }));
    await repo.pins.upsert(pin("capin_1", { label: "old", clientUpdatedAt: "2026-07-14T14:00:00Z" }));
    expect((await repo.pins.list(pin("capin_1").projectNumber))[0].label).toBe("new");

    await repo.pins.upsert(pin("capin_1", { deleted: true, clientUpdatedAt: "2026-07-14T16:00:00Z" }));
    expect((await repo.pins.list(pin("capin_1").projectNumber))[0].deleted).toBe(true);
  });
});
