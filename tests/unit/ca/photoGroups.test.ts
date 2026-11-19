import { describe, expect, it } from "vitest";

import { NO_PIN_GROUP, groupPhotosByPin, photoIdsInReport } from "@/lib/ca/photoGroups";

const drawings = [
  { id: "d1", title: "First Floor Plan", sheetNumber: "A-101" },
  { id: "d2", title: "Second Floor Plan" },
];
const pins = [
  { id: "p-d2-1", drawingId: "d2", label: "" },
  { id: "p-d1-2", drawingId: "d1", label: "Stair" },
  { id: "p-d1-1", drawingId: "d1", label: "" },
];
const pinNumbers = new Map([
  ["p-d1-1", 1],
  ["p-d1-2", 2],
  ["p-d2-1", 1],
]);
const pinNames = new Map([
  ["p-d1-1", "Pin 1"],
  ["p-d1-2", "Stair"],
  ["p-d2-1", "Pin 1"],
]);
const photo = (id: string, pinId?: string) => ({ id, pinId, takenAt: "2026-11-17T15:00:00Z" });

describe("groupPhotosByPin", () => {
  it("groups by pin in drawing then pin order, with unpinned photos last", () => {
    const groups = groupPhotosByPin({
      photos: [photo("a", "p-d2-1"), photo("b"), photo("c", "p-d1-2"), photo("d", "p-d1-1"), photo("e", "p-d1-1"), photo("f", "gone")],
      pins,
      pinNumbers,
      pinNames,
      drawings,
    });
    expect(groups.map((g) => g.key)).toEqual(["p-d1-1", "p-d1-2", "p-d2-1", NO_PIN_GROUP]);
    expect(groups[0]).toMatchObject({ title: "Pin 1", subtitle: "A-101 · First Floor Plan" });
    expect(groups[0].photos.map((p) => p.id)).toEqual(["d", "e"]);
    expect(groups[1].title).toBe("Stair");
    expect(groups[2].subtitle).toBe("Second Floor Plan");
    // A photo whose pin was deleted has no location any more.
    expect(groups[3].photos.map((p) => p.id)).toEqual(["b", "f"]);
  });

  it("omits empty groups", () => {
    expect(groupPhotosByPin({ photos: [], pins, pinNumbers, pinNames, drawings })).toEqual([]);
  });
});

describe("photoIdsInReport", () => {
  it("collects the project photo and every item photo", () => {
    const ids = photoIdsInReport({
      coverPhotoId: "c",
      items: [{ photos: [{ photoId: "a" }] }, { photos: [{ photoId: "b" }, { photoId: "a" }] }],
    });
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });
});
