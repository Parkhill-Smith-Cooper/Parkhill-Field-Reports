import "server-only";

import ExcelJS from "exceljs";

import {
  LOG_COLORS,
  LOG_COLUMNS,
  LOG_TITLE,
  PRIORITIES,
  STATUSES,
  buildDeficiencyLogRows,
  logSubtitle,
} from "@/lib/deficiencyLog";
import type { SavedObservation } from "@/types";

const FONT = "Cambria";
/** Blank rows after the data that still carry the dropdowns, so the engineer
 *  can keep adding entries. They are left visually plain. */
const SPARE_ROWS = 100;

/** Roughly how many wrapped lines `text` needs in a column `width` wide. */
function wrappedLines(text: string, width: number): number {
  return text
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (width * 1.05))), 0);
}

const argb = (hex: string) => `FF${hex}`;
const solid = (hex: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: argb(hex) },
});
const ruleBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: argb(LOG_COLORS.rowRule) } },
  bottom: { style: "thin", color: { argb: argb(LOG_COLORS.rowRule) } },
};

/**
 * Builds the deficiency log as a real, editable workbook: Priority and Status
 * are dropdowns, Priority and Status colour themselves as they are changed,
 * and there is room below the data to add rows by hand.
 */
export async function buildDeficiencyLogWorkbook(
  projectNumber: string,
  projectName: string | undefined,
  observations: SavedObservation[],
): Promise<Buffer> {
  const rows = buildDeficiencyLogRows(observations);
  const lastCol = LOG_COLUMNS.length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Parkhill Field Reports";
  const sheet = workbook.addWorksheet("Deficiency Log", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: true }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "4:4",
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.6,
        header: 0.3,
        footer: 0.3,
      },
    },
    headerFooter: { oddFooter: "&RPage &P of &N" },
  });

  sheet.columns = LOG_COLUMNS.map((column) => ({ width: column.width }));

  // Row 1: title bar
  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell(1, 1);
  title.value = LOG_TITLE;
  title.font = { name: FONT, size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = solid(LOG_COLORS.titleBar);
  title.alignment = { vertical: "middle", indent: 0 };
  sheet.getRow(1).height = 30;

  // Row 2: subtitle bar
  sheet.mergeCells(2, 1, 2, lastCol);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = logSubtitle(projectNumber, projectName);
  subtitle.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  subtitle.fill = solid(LOG_COLORS.subtitleBar);
  subtitle.alignment = { vertical: "middle" };
  sheet.getRow(2).height = 20;

  // Row 3: spacer. Row 4: column headers.
  sheet.getRow(3).height = 10;
  const header = sheet.getRow(4);
  header.height = 28;
  LOG_COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(LOG_COLORS.titleBar);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  const dataStart = 5;
  const total = rows.length + SPARE_ROWS;

  for (let i = 0; i < total; i++) {
    const rowNumber = dataStart + i;
    const row = sheet.getRow(rowNumber);
    const data = rows[i];
    const band = i % 2 === 0 ? LOG_COLORS.rowBlue : LOG_COLORS.rowGrey;

    // Spare rows stay unstyled; ruling and banding on empty rows is what made
    // the sheet look like notebook paper.
    if (!data) {
      LOG_COLUMNS.forEach((_, index) => {
        row.getCell(index + 1).font = { name: FONT, size: 10 };
      });
      continue;
    }

    // Taller rows for longer text, as in the template (minimum two lines).
    const lines = Math.max(
      2,
      ...LOG_COLUMNS.map((column, index) =>
        wrappedLines(String(data[column.key] ?? ""), LOG_COLUMNS[index].width),
      ),
    );
    row.height = Math.min(lines * 13.5 + 6, 400);

    LOG_COLUMNS.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      if (data) {
        if (column.key === "date") {
          const [y, m, d] = data.date.split("-").map(Number);
          cell.value = new Date(Date.UTC(y, m - 1, d));
          cell.numFmt = "m/d/yyyy";
        } else {
          // Blank Priority / Responsible Party stay truly empty.
          const value = data[column.key];
          if (value !== "") cell.value = value;
        }
      }
      cell.font = { name: FONT, size: 10 };
      cell.alignment = {
        vertical: "top",
        horizontal: column.key === "id" || column.key === "date" ? "right" : "left",
        wrapText: true,
      };
      cell.border = ruleBorder;
      cell.fill = solid(band);
    });
  }

  const dataEnd = dataStart + total - 1;
  const priorityCol = LOG_COLUMNS.findIndex((c) => c.key === "priority") + 1;
  const statusCol = LOG_COLUMNS.findIndex((c) => c.key === "status") + 1;

  // Dropdowns, over the data and the spare rows. Priority has no default, so a
  // blank cell stays valid.
  for (let r = dataStart; r <= dataEnd; r++) {
    sheet.getCell(r, priorityCol).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${PRIORITIES.join(",")}"`],
    };
    sheet.getCell(r, statusCol).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${STATUSES.join(",")}"`],
    };
  }

  // Colour follows the value, so it keeps working as the engineer edits.
  const col = (n: number) => String.fromCharCode(64 + n);
  const priorityRange = `${col(priorityCol)}${dataStart}:${col(priorityCol)}${dataEnd}`;
  const statusRange = `${col(statusCol)}${dataStart}:${col(statusCol)}${dataEnd}`;
  let rulePriority = 0;
  const rule = (
    text: string,
    fill: string,
    font?: Partial<ExcelJS.Font>,
  ): ExcelJS.ConditionalFormattingRule => ({
    type: "cellIs",
    operator: "equal",
    formulae: [`"${text}"`],
    priority: ++rulePriority,
    style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: argb(fill) } }, font },
  });
  sheet.addConditionalFormatting({
    ref: priorityRange,
    rules: [
      rule("High", LOG_COLORS.flagPink, {
        bold: true,
        color: { argb: argb(LOG_COLORS.flagRedText) },
      }),
    ],
  });
  sheet.addConditionalFormatting({
    ref: statusRange,
    rules: [
      rule("Open", LOG_COLORS.flagPink),
      rule("In Progress", LOG_COLORS.flagYellow),
      rule("Closed", LOG_COLORS.flagGreen),
    ],
  });

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: dataStart + Math.max(rows.length, 1) - 1, column: lastCol },
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
