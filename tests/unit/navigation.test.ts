import { describe, expect, it } from "vitest";

import { safeReturnTo } from "@/lib/auth/relayState";
import { caProjectPath } from "@/lib/ca/routes";
import { DEFAULT_LANDING, sectionForPath } from "@/lib/navigation";

describe("landing and section routing", () => {
  it("lands on CA Field Reports by default", () => {
    expect(DEFAULT_LANDING).toBe("/field-reports");
    expect(safeReturnTo(null)).toBe("/field-reports");
    expect(safeReturnTo("https://evil.example")).toBe("/field-reports");
    expect(safeReturnTo("//evil.example")).toBe("/field-reports");
  });

  it("still honours a requested same-origin destination, including CX", () => {
    expect(safeReturnTo("/projects/24-1057")).toBe("/projects/24-1057");
  });

  it("tells CA and CX apart by path", () => {
    expect(sectionForPath("/projects")).toBe("cx");
    expect(sectionForPath("/projects/24-1057/observations/new/observation")).toBe("cx");
    expect(sectionForPath("/field-reports")).toBe("ca");
    expect(sectionForPath("/projects-archive")).toBe("ca");
  });

  it("builds CA project URLs", () => {
    expect(caProjectPath("45371.25.01")).toBe("/field-reports/45371.25.01/capture");
    expect(caProjectPath("A B", "reports")).toBe("/field-reports/A%20B/reports");
  });
});
