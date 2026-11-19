import { describe, expect, it } from "vitest";

import { photosAvailableToReport, photosOfReport } from "@/lib/ca/reportPhotos";

const photos = [
  { id: "older" }, // captured before reports had their own steps
  { id: "mine", reportId: "carep_a" },
  { id: "other", reportId: "carep_b" },
  { id: "orphan", reportId: "carep_deleted" },
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("report photos", () => {
  it("a report's own photos", () => {
    expect(ids(photosOfReport(photos, "carep_a"))).toEqual(["mine"]);
  });

  it("without the full report list, other reports' photos are never offered", () => {
    expect(ids(photosAvailableToReport(photos, "carep_a"))).toEqual(["older", "mine"]);
  });

  it("photos of a deleted draft stay available to the remaining reports", () => {
    const known = new Set(["carep_a", "carep_b"]);
    expect(ids(photosAvailableToReport(photos, "carep_a", known))).toEqual(["older", "mine", "orphan"]);
    expect(ids(photosAvailableToReport(photos, "carep_b", known))).toEqual(["older", "other", "orphan"]);
  });
});
