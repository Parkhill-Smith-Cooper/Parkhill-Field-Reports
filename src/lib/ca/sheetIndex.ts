/**
 * Sheet numbers and names for the pages of an uploaded drawing set.
 *
 * Pure helpers (no DOM, no pdf.js) shared by the browser, which reads each
 * page's title block, and the server, which asks AI to name the sheets:
 *
 * - `titleBlockLines` keeps only the text a title block is likely to hold
 *   (the right-hand strip and the bottom band of the sheet) and joins it into
 *   lines, so the AI request stays small even for a dense floor plan.
 * - `guessSheetNumber` is the instant, offline guess shown before AI answers,
 *   and the answer when AI is not configured.
 * - `sheetLabel` is how a sheet is presented everywhere: `A-101 - Level 1 Floor Plan`.
 */

import type { CaSetSheet } from "@/types/ca";

export type SetSheet = CaSetSheet;

/** A positioned run of text on a page, in PDF units (origin bottom-left). */
export type PageTextItem = { str: string; x: number; y: number; size: number };

/** What the browser sends for AI naming: title-block text, or a title-block image. */
export type SheetNameRequestPage = {
  page: number;
  /** Title-block lines, `[size] text`, largest text first within the block. */
  lines: string[];
  /** A JPEG data URL of the title-block area, only when the page has no text. */
  image?: string;
};

export type SheetNameResult = { page: number; sheetNumber: string; sheetName: string };

export const MAX_SHEET_NUMBER = 60;
export const MAX_SHEET_NAME = 200;
/** Drawing-set PDFs are uploaded in blocks of this size (under the proxy's 10 MB body limit). */
export const SET_BLOCK_BYTES = 8 * 1024 * 1024;
/** At most this many blocks: a 512 MB set. */
export const MAX_SET_BLOCKS = 64;
export const MAX_SET_PAGES = 2000;
export const MAX_PAGES_PER_REQUEST = 8;
export const MAX_LINES_PER_PAGE = 80;
export const MAX_LINE_LENGTH = 200;
/** Base64 data URL of one title-block crop. */
export const MAX_IMAGE_CHARS = 1_500_000;

/** `A-101 - Level 1 Floor Plan`; either part alone when the other is blank. */
export function sheetLabel(sheet: { sheetNumber?: string; sheetName?: string; title?: string }): string {
  const number = sheet.sheetNumber?.trim() ?? "";
  const name = (sheet.sheetName ?? sheet.title ?? "").trim();
  return [number, name].filter(Boolean).join(" - ");
}

/** The fraction of the sheet's width (from the right) and height (from the bottom) searched. */
const RIGHT_STRIP = 0.3;
const BOTTOM_BAND = 0.2;

/**
 * Title-block text as lines. Items in the right-hand strip or bottom band are
 * grouped into lines (same baseline, left to right), and each line carries
 * its text size, because the sheet number is usually the largest text there.
 */
export function titleBlockLines(items: PageTextItem[], width: number, height: number): string[] {
  const inBlock = items.filter(
    (i) => i.str.trim() && (i.x >= width * (1 - RIGHT_STRIP) || i.y <= height * BOTTOM_BAND),
  );
  inBlock.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; size: number; parts: PageTextItem[] }[] = [];
  for (const item of inBlock) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= Math.max(1.5, item.size * 0.4));
    if (line) {
      line.parts.push(item);
      line.size = Math.max(line.size, item.size);
    } else {
      lines.push({ y: item.y, size: item.size, parts: [item] });
    }
  }

  const texts = lines
    .map((l, order) => {
      const text = l.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, MAX_LINE_LENGTH);
      return { order, size: l.size, text };
    })
    .filter((l) => l.text);

  // On a crowded sheet, keep the largest text (the sheet number is usually the
  // largest, and often at the bottom right), then restore reading order.
  const kept =
    texts.length <= MAX_LINES_PER_PAGE
      ? texts
      : [...texts]
          .sort((a, b) => b.size - a.size || a.order - b.order)
          .slice(0, MAX_LINES_PER_PAGE)
          .sort((a, b) => a.order - b.order);
  return kept.map((l) => `[${Math.round(l.size)}] ${l.text}`);
}

/**
 * Sheet numbers as drawn on title blocks: a discipline prefix of one to three
 * letters, an optional separator, then digits with an optional decimal part
 * and suffix. `A-101`, `A101`, `M2.01`, `FP-1`, `E-201A`, `G0.00`.
 */
const SHEET_NUMBER = /^[A-Z]{1,3}[-. ]?\d{1,4}(?:[.-]\d{1,3})?[A-Z]?$/;

/** Words that match the pattern but are never sheet numbers. */
const NOT_SHEET_NUMBERS = new Set(["NO1", "NO2", "REV1", "REV2", "REV3"]);

/**
 * The most likely sheet number in the title-block lines: the largest text
 * that looks like one. Empty when nothing does (the engineer or AI names it).
 */
export function guessSheetNumber(lines: string[]): string {
  let best: { size: number; value: string } | null = null;
  for (const line of lines) {
    const match = /^\[(\d+)\] (.*)$/.exec(line);
    if (!match) continue;
    const size = Number(match[1]);
    for (const token of match[2].split(/\s{2,}|\s(?=[A-Z]{1,3}[-.]?\d)/)) {
      const value = token.trim().toUpperCase();
      if (!SHEET_NUMBER.test(value) || NOT_SHEET_NUMBERS.has(value.replace(/[-. ]/g, ""))) continue;
      if (!best || size > best.size) best = { size, value };
    }
  }
  return best?.value ?? "";
}

/** Initial entries for a freshly opened set: the guess, or blank. */
export function initialSheets(pages: { page: number; lines: string[] }[]): SetSheet[] {
  return pages.map(({ page, lines }) => ({
    page,
    sheetNumber: guessSheetNumber(lines),
    sheetName: "",
    naming: "guess",
  }));
}

/**
 * Applies AI results to the sheets. Sheets the engineer has edited keep their
 * values; a blank AI answer never erases a guess.
 */
export function applySheetNames(sheets: SetSheet[], results: SheetNameResult[]): SetSheet[] {
  const byPage = new Map(results.map((r) => [r.page, r]));
  return sheets.map((sheet) => {
    const result = byPage.get(sheet.page);
    if (!result || sheet.naming === "edited") return sheet;
    const sheetNumber = clean(result.sheetNumber, MAX_SHEET_NUMBER) || sheet.sheetNumber;
    const sheetName = clean(result.sheetName, MAX_SHEET_NAME) || sheet.sheetName;
    return { ...sheet, sheetNumber, sheetName, naming: "ai" };
  });
}

/** Display name for a sheet that has no name yet. */
export const untitledSheet = (page: number) => `Page ${page}`;

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

const titleCase = (text: string) =>
  text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());

/**
 * MOCK sheet naming, for tests and demos (`CA_SHEET_NAMING=mock`): the guessed
 * sheet number, and the line after a "SHEET TITLE" / "DRAWING TITLE" label as
 * the name. Deterministic, and nothing leaves the server.
 */
export function mockSheetNames(pages: SheetNameRequestPage[]): SheetNameResult[] {
  return pages.map(({ page, lines }) => {
    const text = lines.map((l) => l.replace(/^\[\d+\] /, ""));
    const label = text.findIndex((l) => /^(SHEET|DRAWING) TITLE:?$/i.test(l.trim()));
    const name = label >= 0 ? (text[label + 1] ?? "") : "";
    return { page, sheetNumber: guessSheetNumber(lines), sheetName: titleCase(name.trim()).slice(0, MAX_SHEET_NAME) };
  });
}
