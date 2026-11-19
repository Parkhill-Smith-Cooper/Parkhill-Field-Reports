import { describe, expect, it } from "vitest";

import { issueReport } from "@/lib/ca/issueReport";
import { buildReportLocations, INSET_HEIGHT, INSET_WIDTH, insetView } from "@/lib/ca/reportLocations";
import { validateReportContent } from "@/lib/ca/validation";
import { createMockCaRepository } from "@/repositories/ca/mockCaRepository";
import type { CaDrawing, CaReportItem } from "@/types/ca";

import { photo, pin, PROJECT, reportInput } from "./fixtures";

function drawing(id: string, overrides: Partial<CaDrawing> = {}): CaDrawing {
  return {
    id,
    projectNumber: PROJECT,
    title: "First Floor Plan",
    sheetNumber: "A-101",
    fileType: "image",
    page: 1,
    pageCount: 1,
    originalFileName: "a101.png",
    filePath: `${PROJECT}/drawings/${id}.png`,
    width: 2000,
    height: 1000,
    source: "upload",
    isCurrent: true,
    uploadedAt: "2026-07-14T14:30:00.000Z",
    uploadedBy: "engineer@parkhill.com",
    ...overrides,
  };
}

const item = (id: string, photos: [string, string][]): CaReportItem => ({
  id,
  status: "in-progress",
  description: "",
  photos: photos.map(([photoId, caption]) => ({ photoId, caption })),
});

describe("Photo Locations pages", () => {
  const pins = [
    pin("capin_a", { label: "Mech room 110", x: 0.25, y: 0.75 }),
    pin("capin_b", { createdAt: "2026-07-14T15:00:00.000Z" }),
    pin("capin_gone", { deleted: true }),
  ];
  const photos = [
    photo("caph_1", { pinId: "capin_b", caption: "Own caption" }),
    photo("caph_2", { pinId: "capin_a" }),
    photo("caph_3", { pinId: "capin_b" }),
    photo("caph_4"),
    photo("caph_5", { pinId: "capin_gone" }),
  ];

  it("groups the report's photos by pin, in report order, with report captions", () => {
    const locations = buildReportLocations({
      content: {
        items: [
          item("caitem_1", [["caph_1", ""], ["caph_2", "Duct at grid 5"], ["caph_4", "No pin"], ["caph_5", "Deleted pin"]]),
          item("caitem_2", [["caph_3", "Valve"], ["caph_2", "Again"]]),
        ],
      },
      photos,
      pins,
      drawings: [drawing("cadwg_1")],
    });
    expect(locations.map((l) => l.title)).toEqual(["Pin 2", "Mech room 110"]);
    expect(locations[0]).toMatchObject({
      subtitle: "A-101 · First Floor Plan",
      drawing: { id: "cadwg_1", width: 2000, height: 1000 },
      photos: [
        { photoId: "caph_1", caption: "Own caption" },
        { photoId: "caph_3", caption: "Valve" },
      ],
    });
    // A photo used twice shows once, with its first caption.
    expect(locations[1]).toMatchObject({ x: 0.25, y: 0.75, photos: [{ photoId: "caph_2", caption: "Duct at grid 5" }] });
  });

  it("shows no floor plan when the pin's drawing is unknown", () => {
    const [location] = buildReportLocations({
      content: { items: [item("caitem_1", [["caph_2", ""]])] },
      photos,
      pins,
      drawings: [],
    });
    expect(location).toMatchObject({ drawing: null, subtitle: "" });
  });
});

describe("floor-plan inset", () => {
  const sheet = { sheetWidth: 2000, sheetHeight: 1000 };

  it("fits the whole sheet at zoom 1", () => {
    const v = insetView({ ...sheet, x: 0.25, y: 0.75, zoom: 1 });
    expect(v.width).toBeCloseTo(INSET_WIDTH);
    expect(v.height).toBeCloseTo(INSET_WIDTH / 2);
    expect(v.top).toBeCloseTo((INSET_HEIGHT - INSET_WIDTH / 2) / 2);
    expect(v.pinLeft).toBeCloseTo(INSET_WIDTH / 4);
  });

  it("centres the pin when zoomed in, but never shows past the sheet's edge", () => {
    const mid = insetView({ ...sheet, x: 0.5, y: 0.5, zoom: 4 });
    expect(mid.pinLeft).toBeCloseTo(INSET_WIDTH / 2);
    expect(mid.pinTop).toBeCloseTo(INSET_HEIGHT / 2);

    const corner = insetView({ ...sheet, x: 0.01, y: 0.01, zoom: 4 });
    expect(corner.left).toBe(0);
    expect(corner.top).toBe(0);
    expect(corner.pinLeft).toBeLessThan(INSET_WIDTH / 2);
  });

  it("keeps zoom within limits", () => {
    expect(insetView({ ...sheet, x: 0.5, y: 0.5, zoom: 0.1 }).width).toBeCloseTo(INSET_WIDTH);
    expect(insetView({ ...sheet, x: 0.5, y: 0.5, zoom: 1000 }).width).toBeCloseTo(INSET_WIDTH * 12);
  });

  it("validates saved zoom levels", () => {
    const content = reportInput().draft;
    expect(validateReportContent({ ...content, locationZoom: { capin_a: 2.5 } })).toBeNull();
    expect(validateReportContent({ ...content, locationZoom: { capin_a: 0 } })).toMatch(/zoom/);
    expect(validateReportContent({ ...content, locationZoom: { "../x": 2 } })).toMatch(/zoom/);
    expect(validateReportContent({ ...content, locationZoom: [] })).toMatch(/zoom/);
  });
});

describe("issuing with Photo Locations", () => {
  async function setup() {
    const repo = createMockCaRepository({ dataDir: null });
    await repo.projects.create({ projectNumber: PROJECT, name: "S", source: "mock" }, "a");
    const report = await repo.reports.create(reportInput());
    await repo.reports.saveDraft(PROJECT, report.id, {
      ...report.draft,
      items: [item("caitem_1", [["caph_1", "Duct"]])],
      locationZoom: { capin_a: 3 },
    });
    await repo.photos.upsert(photo("caph_1", { pinId: "capin_a" }));
    return { repo, report };
  }

  it("freezes each location so later pin moves cannot change the issued report", async () => {
    const { repo, report } = await setup();
    await repo.drawings.upsert(drawing("cadwg_1"));
    await repo.pins.upsert(pin("capin_a", { label: "Mech room 110", x: 0.3, y: 0.4 }));

    const issued = await issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" });
    expect(issued?.revision.locations).toEqual([
      {
        pinId: "capin_a",
        title: "Mech room 110",
        subtitle: "A-101 · First Floor Plan",
        drawing: { id: "cadwg_1", filePath: `${PROJECT}/drawings/cadwg_1.png`, width: 2000, height: 1000 },
        x: 0.3,
        y: 0.4,
        photos: [{ photoId: "caph_1", caption: "Duct" }],
      },
    ]);
    expect(issued?.revision.content.locationZoom).toEqual({ capin_a: 3 });

    await repo.pins.upsert(pin("capin_a", { label: "Moved", x: 0.9, clientUpdatedAt: "2026-07-20T00:00:00.000Z" }));
    const stored = await repo.reports.getRevision(PROJECT, report.id, 0);
    expect(stored?.locations?.[0]).toMatchObject({ title: "Mech room 110", x: 0.3 });
  });

  it("refuses to issue while a pin or its floor plan has not uploaded", async () => {
    const { repo, report } = await setup();
    await expect(issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" })).rejects.toMatchObject({
      name: "CaConflictError",
      message: expect.stringContaining("pin"),
    });
    await repo.pins.upsert(pin("capin_a"));
    await expect(issueReport({ repo, projectNumber: PROJECT, reportId: report.id, issuedBy: "a" })).rejects.toMatchObject({
      name: "CaConflictError",
      message: expect.stringContaining("floor plan"),
    });
  });
});
