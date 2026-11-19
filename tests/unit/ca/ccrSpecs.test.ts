import { describe, expect, it } from "vitest";

import { ccrSpecPaths, mapCcrSpecSections } from "@/lib/ca/ccrSpecs";
import { currentSpecSections, divisionLabel, groupByDivision, specSectionMatches } from "@/lib/ca/specSections";
import { syncedSpecSectionId } from "@/lib/ca/syncedSets";
import { isValidGeneratedId } from "@/lib/validation";
import type { CaSpecSection } from "@/types/ca";

/** What parkhill-ccr's `toServiceSpecSection` sends, recorded. */
const sample = {
  externalRef: "0f8c1c2e-1111-4a4a-9b9b-123456789abc-spec-033000-r2",
  sectionKey: "033000",
  sectionNumber: "03 30 00",
  division: "03",
  title: "Cast-in-Place Concrete",
  revision: 2,
  revisionLabel: "Rev 02 — Addendum 2",
  isLatestApproved: true,
  fileType: "pdf",
  fileName: "03 30 00 - Cast-in-Place Concrete.pdf",
  size: 52_431,
  uploadedAt: "2026-11-19T15:00:00.000Z",
};

describe("ccr specification mapping", () => {
  it("maps the service shape", () => {
    expect(mapCcrSpecSections([sample])).toEqual([
      {
        externalRef: sample.externalRef,
        sectionKey: "033000",
        sectionNumber: "03 30 00",
        division: "03",
        title: "Cast-in-Place Concrete",
        revision: 2,
        revisionLabel: "Rev 02 — Addendum 2",
        isLatestApproved: true,
        fileType: "pdf",
        fileName: "03 30 00 - Cast-in-Place Concrete.pdf",
        sizeBytes: 52_431,
        uploadedAt: "2026-11-19T15:00:00.000Z",
      },
    ]);
  });

  it("drops anything it cannot trust, and a second revision of one section", () => {
    const offers = mapCcrSpecSections([
      { ...sample, fileType: "docx" },
      { ...sample, sectionKey: "3300" },
      { ...sample, revision: 0 },
      { ...sample, externalRef: "" },
      null,
      sample,
      { ...sample, externalRef: "other", revision: 3 },
    ]);
    expect(offers.map((o) => o.externalRef)).toEqual([sample.externalRef]);
  });

  it("never infers latest; a non-array body is an error", () => {
    expect(mapCcrSpecSections([{ ...sample, isLatestApproved: "yes" }])[0].isLatestApproved).toBe(false);
    expect(() => mapCcrSpecSections({})).toThrow();
  });

  it("builds the service paths", () => {
    expect(ccrSpecPaths.latest("1.10")).toBe("/api/document-control/specifications/service/projects/number/1.10/latest");
    expect(ccrSpecPaths.file("1.10", "p-spec-033000-r2")).toBe(
      "/api/document-control/specifications/service/projects/number/1.10/revisions/p-spec-033000-r2/file",
    );
  });

  it("derives a valid, stable record id even from a long ccr id", () => {
    const id = syncedSpecSectionId(sample.externalRef);
    expect(isValidGeneratedId(id)).toBe(true);
    expect(syncedSpecSectionId(sample.externalRef)).toBe(id);
    expect(syncedSpecSectionId("short-r1")).toBe("dcspec_short_r1");
  });
});

describe("specification helpers", () => {
  const s = (sectionKey: string, title: string, isCurrent = true) =>
    ({ id: sectionKey, sectionKey, sectionNumber: `${sectionKey.slice(0, 2)} ${sectionKey.slice(2, 4)} ${sectionKey.slice(4, 6)}`, division: sectionKey.slice(0, 2), title, revision: 1, isCurrent }) as CaSpecSection;

  it("searches by number with or without spaces, or by title", () => {
    const concrete = s("033000", "Cast-in-Place Concrete");
    expect(specSectionMatches(concrete, "03 30")).toBe(true);
    expect(specSectionMatches(concrete, "0330")).toBe(true);
    expect(specSectionMatches(concrete, "concrete")).toBe(true);
    expect(specSectionMatches(concrete, "steel")).toBe(false);
  });

  it("groups current sections by division", () => {
    const groups = groupByDivision(currentSpecSections([s("051200", "Steel"), s("033000", "Concrete"), s("033500", "Old", false)]));
    expect(groups.map(([d, items]) => [d, items.map((i) => i.sectionKey)])).toEqual([
      ["03", ["033000"]],
      ["05", ["051200"]],
    ]);
    expect(divisionLabel("03")).toBe("Division 03 — Concrete");
    expect(divisionLabel("47")).toBe("Division 47");
  });
});
