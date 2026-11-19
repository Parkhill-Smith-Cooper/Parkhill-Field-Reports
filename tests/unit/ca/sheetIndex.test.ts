import { describe, expect, it, vi } from "vitest";

import { parseSheetNames, suggestSheetNames } from "@/lib/ai/sheetNames";
import {
  applySheetNames,
  guessSheetNumber,
  initialSheets,
  sheetLabel,
  titleBlockLines,
  type PageTextItem,
  type SetSheet,
} from "@/lib/ca/sheetIndex";
import { validateDrawingSetCommit, validateSetSheetEdit, validateSheetNameRequest } from "@/lib/ca/validation";

/** A 36 x 24 in sheet (2592 x 1728 pt) with a title block down the right edge. */
const W = 2592;
const H = 1728;
const item = (str: string, x: number, y: number, size = 10): PageTextItem => ({ str, x, y, size });

const floorPlanPage: PageTextItem[] = [
  // The drawing itself (room names) - left of the title block.
  item("CLASSROOM 101", 600, 900, 12),
  item("LIBRARY", 1200, 900, 12),
  item("A-501", 900, 700, 8), // a detail reference in the plan, not the sheet number
  // Title block.
  item("PARKHILL", 2300, 1600, 14),
  item("ELEMENTARY SCHOOL 01", 2300, 1500, 11),
  item("SHEET TITLE", 2300, 300, 6),
  item("LEVEL 1", 2300, 260, 14),
  item("FLOOR PLAN", 2380, 260, 14),
  item("PROJECT NO. 45371.25.01", 2300, 200, 7),
  item("A-101", 2400, 80, 36),
];

describe("title-block text", () => {
  it("keeps the right strip and bottom band, joined into lines with sizes", () => {
    const lines = titleBlockLines(floorPlanPage, W, H);
    expect(lines).toContain("[14] LEVEL 1 FLOOR PLAN");
    expect(lines).toContain("[36] A-101");
    expect(lines.join("\n")).not.toContain("CLASSROOM");
    expect(lines.join("\n")).not.toContain("A-501");
    // Top to bottom.
    expect(lines.indexOf("[14] PARKHILL")).toBeLessThan(lines.indexOf("[36] A-101"));
  });

  it("guesses the sheet number from the largest matching text", () => {
    expect(guessSheetNumber(titleBlockLines(floorPlanPage, W, H))).toBe("A-101");
    expect(guessSheetNumber(["[8] SHEET NO. M2.01", "[6] REV 1"])).toBe("M2.01");
    expect(guessSheetNumber(["[20] E-201A"])).toBe("E-201A");
    expect(guessSheetNumber(["[20] COVER SHEET", "[8] 45371.25.01"])).toBe("");
  });

  it("starts a set with guesses and no names", () => {
    expect(initialSheets([{ page: 1, lines: ["[30] G-001"] }, { page: 2, lines: [] }])).toEqual([
      { page: 1, sheetNumber: "G-001", sheetName: "", naming: "guess" },
      { page: 2, sheetNumber: "", sheetName: "", naming: "guess" },
    ]);
  });
});

describe("sheet labels", () => {
  it("is <sheet number> - <sheet name>, or either alone", () => {
    expect(sheetLabel({ sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" })).toBe("A-101 - Level 1 Floor Plan");
    expect(sheetLabel({ sheetNumber: "A-101", sheetName: "" })).toBe("A-101");
    expect(sheetLabel({ sheetNumber: "", sheetName: "Roof Plan" })).toBe("Roof Plan");
    expect(sheetLabel({ sheetNumber: "A-102", title: "Level 2" })).toBe("A-102 - Level 2");
  });
});

describe("applying AI names", () => {
  const sheets: SetSheet[] = [
    { page: 1, sheetNumber: "A-101", sheetName: "", naming: "guess" },
    { page: 2, sheetNumber: "X", sheetName: "Mine", naming: "edited" },
    { page: 3, sheetNumber: "A-103", sheetName: "", naming: "guess" },
  ];

  it("fills guesses, never overwrites edits, never blanks a guess", () => {
    const next = applySheetNames(sheets, [
      { page: 1, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" },
      { page: 2, sheetNumber: "A-102", sheetName: "Level 2 Floor Plan" },
      { page: 3, sheetNumber: "", sheetName: "  Roof   Plan " },
    ]);
    expect(next).toEqual([
      { page: 1, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan", naming: "ai" },
      { page: 2, sheetNumber: "X", sheetName: "Mine", naming: "edited" },
      { page: 3, sheetNumber: "A-103", sheetName: "Roof Plan", naming: "ai" },
    ]);
  });

  it("parses only well-formed answers for pages that were asked about", () => {
    const json = JSON.stringify({
      sheets: [
        { page: 1, sheetNumber: " A-101 ", sheetName: "Level 1\nFloor Plan" },
        { page: 9, sheetNumber: "Z-9", sheetName: "Not asked" },
        { page: 2, sheetNumber: 102, sheetName: "Bad type" },
        { page: 1, sheetNumber: "dup", sheetName: "dup" },
      ],
    });
    expect(parseSheetNames(json, [1, 2])).toEqual([{ page: 1, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" }]);
    expect(parseSheetNames("{}", [1])).toEqual([]);
  });

  it("MOCK naming reads the titled line and never calls out", async () => {
    vi.stubEnv("CA_SHEET_NAMING", "mock");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await suggestSheetNames([{ page: 2, lines: titleBlockLines(floorPlanPage, W, H) }])).toEqual([
      { page: 2, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("is not configured without an OpenAI key, and never calls out", async () => {
    vi.stubEnv("CA_SHEET_NAMING", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(suggestSheetNames([{ page: 1, lines: ["[30] A-101"] }])).rejects.toMatchObject({
      name: "CaNotConfiguredError",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("sends title-block text and returns the parsed sheets", async () => {
    vi.stubEnv("CA_SHEET_NAMING", "");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        choices: [{ message: { content: JSON.stringify({ sheets: [{ page: 4, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" }] }) } }],
      }),
    );
    expect(await suggestSheetNames([{ page: 4, lines: ["[36] A-101", "[14] LEVEL 1 FLOOR PLAN"] }])).toEqual([
      { page: 4, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" },
    ]);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as { messages: { content: unknown }[] };
    expect(JSON.stringify(body.messages[1].content)).toContain("LEVEL 1 FLOOR PLAN");
    vi.unstubAllEnvs();
  });
});

describe("drawing-set validation", () => {
  const sheets = [
    { page: 1, sheetNumber: "G-001", sheetName: "", naming: "guess" },
    { page: 2, sheetNumber: "", sheetName: "", naming: "guess" },
  ];
  const commit = { fileName: "CD Set.pdf", blockCount: 3, pageCount: 2, sheets };

  it("accepts a commit with one sheet per page, in order", () => {
    expect(validateDrawingSetCommit(commit)).toBeNull();
    expect(validateDrawingSetCommit({ ...commit, fileName: "set.png" })).not.toBeNull();
    expect(validateDrawingSetCommit({ ...commit, blockCount: 0 })).not.toBeNull();
    expect(validateDrawingSetCommit({ ...commit, blockCount: 65 })).not.toBeNull();
    expect(validateDrawingSetCommit({ ...commit, pageCount: 3 })).not.toBeNull();
    expect(validateDrawingSetCommit({ ...commit, sheets: [sheets[1], sheets[0]] })).not.toBeNull();
    expect(validateDrawingSetCommit({ ...commit, sheets: [sheets[0], { ...sheets[1], naming: "x" }] })).not.toBeNull();
  });

  it("accepts sheet edits within limits", () => {
    expect(validateSetSheetEdit({ page: 2, sheetNumber: "A-101", sheetName: "Level 1 Floor Plan" })).toBeNull();
    expect(validateSetSheetEdit({ page: 0, sheetNumber: "", sheetName: "" })).not.toBeNull();
    expect(validateSetSheetEdit({ page: 1, sheetNumber: "x".repeat(61), sheetName: "" })).not.toBeNull();
    expect(validateSetSheetEdit({ page: 1, sheetNumber: "", sheetName: 5 })).not.toBeNull();
  });
});

describe("sheet-name request validation", () => {
  const ok = { pages: [{ page: 1, lines: ["[36] A-101"] }] };

  it("accepts text pages and JPEG image pages", () => {
    expect(validateSheetNameRequest(ok)).toBeNull();
    expect(validateSheetNameRequest({ pages: [{ page: 2, lines: [], image: "data:image/jpeg;base64,AAAA" }] })).toBeNull();
  });

  it("rejects bad bodies", () => {
    expect(validateSheetNameRequest(null)).not.toBeNull();
    expect(validateSheetNameRequest({ pages: [] })).not.toBeNull();
    expect(validateSheetNameRequest({ pages: Array.from({ length: 9 }, (_, i) => ({ page: i + 1, lines: ["x"] })) })).not.toBeNull();
    expect(validateSheetNameRequest({ pages: [{ page: 0, lines: ["x"] }] })).not.toBeNull();
    expect(validateSheetNameRequest({ pages: [{ page: 1, lines: ["x"] }, { page: 1, lines: ["y"] }] })).not.toBeNull();
    expect(validateSheetNameRequest({ pages: [{ page: 1, lines: [] }] })).not.toBeNull();
    expect(validateSheetNameRequest({ pages: [{ page: 1, lines: [], image: "https://example.com/a.jpg" }] })).not.toBeNull();
    expect(validateSheetNameRequest({ pages: [{ page: 1, lines: ["x".repeat(500)] }] })).not.toBeNull();
  });
});
