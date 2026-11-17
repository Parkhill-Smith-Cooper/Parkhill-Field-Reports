import { describe, expect, it } from "vitest";

import { buildSiteRoute, localDay, routeDays } from "@/lib/ca/siteRoute";

const pin = (id: string, drawingId = "cadwg_1", extra = {}) => ({ id, drawingId, x: 0.5, y: 0.5, label: id, ...extra });
// Midday UTC, so the local calendar day is the same in every US time zone.
const at = (day: string, hhmm: string) => `${day}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00.000Z`;

describe("site route", () => {
  const pins = [pin("A"), pin("B"), pin("C"), pin("D", "cadwg_2"), pin("E", "cadwg_1", { deleted: true }), pin("F")];
  const photos = [
    { id: "1", pinId: "B", takenAt: at("2026-07-14", "1500") },
    { id: "2", pinId: "A", takenAt: at("2026-07-14", "1530") },
    { id: "3", pinId: "B", takenAt: at("2026-07-14", "1600") },
    { id: "4", pinId: "C", takenAt: at("2026-07-15", "1400") },
    { id: "5", pinId: "D", takenAt: at("2026-07-14", "1400") }, // other sheet
    { id: "6", pinId: "E", takenAt: at("2026-07-14", "1300") }, // deleted pin
    { id: "7", takenAt: at("2026-07-14", "1200") }, // not pinned
  ];

  it("orders pins on the sheet by their first photo", () => {
    const { stops, pinsWithoutPhotos } = buildSiteRoute({ pins, photos, drawingId: "cadwg_1" });
    expect(stops.map((s) => [s.step, s.pinId, s.photoCount])).toEqual([
      [1, "B", 2],
      [2, "A", 1],
      [3, "C", 1],
    ]);
    expect(stops[0]).toMatchObject({ firstAt: at("2026-07-14", "1500"), lastAt: at("2026-07-14", "1600") });
    expect(pinsWithoutPhotos).toBe(1); // F
  });

  it("filters to one day", () => {
    const { stops } = buildSiteRoute({ pins, photos, drawingId: "cadwg_1", day: "2026-07-15" });
    expect(stops.map((s) => [s.step, s.pinId])).toEqual([[1, "C"]]);
  });

  it("lists the days with pinned photos on the sheet, newest first", () => {
    expect(routeDays(pins, photos, "cadwg_1")).toEqual(["2026-07-15", "2026-07-14"]);
    expect(routeDays(pins, photos, "cadwg_2")).toEqual(["2026-07-14"]);
    expect(localDay(at("2026-07-14", "1500"))).toBe("2026-07-14");
  });
});
