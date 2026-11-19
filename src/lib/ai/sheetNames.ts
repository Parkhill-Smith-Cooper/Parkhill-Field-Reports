import "server-only";

import { caConfig } from "@/lib/ca/config";
import { CaNotConfiguredError } from "@/lib/ca/contracts";
import {
  MAX_SHEET_NAME,
  MAX_SHEET_NUMBER,
  mockSheetNames,
  type SheetNameRequestPage,
  type SheetNameResult,
} from "@/lib/ca/sheetIndex";
import { env } from "@/lib/env";

/**
 * Sheet numbers and names for the pages of an uploaded drawing set, read from
 * each page's title block by OpenAI.
 *
 * The browser sends only the title-block text of each page (or, for a scanned
 * page with no text, a small image of the title-block area), never the whole
 * set. The answer is a suggestion: the engineer sees it and can correct it.
 *
 * Same plain-`fetch`, JSON-schema approach as `suggestions.ts` (CX), kept
 * separate so CA changes never touch the CX prompts.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 60_000;

const INSTRUCTIONS = `You read the title blocks of architectural and engineering construction drawing sheets.

For each page you receive the text found in its title-block area (the right-hand strip and bottom band of the sheet), one line per entry, each prefixed with its text size in brackets - or, for a scanned page, an image of that area.

For every page, return:
- sheetNumber: the sheet number exactly as printed, e.g. "A-101", "M2.01", "E-201A", "G0.00". The sheet number is usually the largest text in the title block, near the bottom-right corner, often next to a label such as "SHEET", "SHEET NO." or "DRAWING NO.". Never return a project number, a date, a revision number or a page count.
- sheetName: the sheet title, e.g. "Level 1 Floor Plan", "Roof Plan", "Mechanical Schedules". Use the title of THIS sheet (often labelled "SHEET TITLE" or "DRAWING TITLE"), not the project name, the client, the firm or a drawing-index entry. Write it in title case, joined into one line.

If a value cannot be found, return an empty string for it rather than guessing. Return one entry per page received, with the same page number.`;

type ChatCompletion = {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
};

/** `CA_SHEET_NAMING` (see src/lib/ca/config.ts) chooses OpenAI, the MOCK reader, or none. */
export async function suggestSheetNames(pages: SheetNameRequestPage[]): Promise<SheetNameResult[]> {
  const mode = caConfig.sheetNaming;
  if (mode === "mock") return mockSheetNames(pages);
  if (mode === "none" || !process.env.OPENAI_API_KEY) {
    throw new CaNotConfiguredError(
      "Automatic sheet naming is not set up. Enter the sheet numbers and names yourself.",
    );
  }

  const content: (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  )[] = [];
  for (const page of pages) {
    content.push({
      type: "text",
      text: page.lines.length
        ? `Page ${page.page} title-block text:\n${page.lines.join("\n")}`
        : `Page ${page.page}: no text layer; the image that follows shows its title-block area.`,
    });
    if (page.image) content.push({ type: "image_url", image_url: { url: page.image, detail: "high" } });
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.openaiModel,
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sheets",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sheets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    sheetNumber: { type: "string" },
                    sheetName: { type: "string" },
                  },
                  required: ["page", "sheetNumber", "sheetName"],
                  additionalProperties: false,
                },
              },
            },
            required: ["sheets"],
            additionalProperties: false,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // Details (bad key, unknown model, quota) go to the server log via
    // handleRoute; the browser gets the generic message.
    throw new Error(`OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }

  const completion = (await response.json()) as ChatCompletion;
  const message = completion.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI declined the request: ${message.refusal}`);

  return parseSheetNames(message?.content ?? "{}", pages.map((p) => p.page));
}

/** Keeps only well-formed answers for pages that were asked about. Exported for tests. */
export function parseSheetNames(json: string, asked: number[]): SheetNameResult[] {
  const wanted = new Set(asked);
  const parsed = JSON.parse(json) as { sheets?: unknown };
  if (!Array.isArray(parsed.sheets)) return [];
  const results: SheetNameResult[] = [];
  for (const entry of parsed.sheets as Record<string, unknown>[]) {
    if (!entry || typeof entry !== "object") continue;
    const { page, sheetNumber, sheetName } = entry;
    if (typeof page !== "number" || !wanted.has(page)) continue;
    if (typeof sheetNumber !== "string" || typeof sheetName !== "string") continue;
    wanted.delete(page);
    results.push({
      page,
      sheetNumber: sheetNumber.trim().slice(0, MAX_SHEET_NUMBER),
      sheetName: sheetName.replace(/\s+/g, " ").trim().slice(0, MAX_SHEET_NAME),
    });
  }
  return results;
}
