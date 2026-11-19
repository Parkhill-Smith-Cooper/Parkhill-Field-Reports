/**
 * A small, obviously-fake drawing-set PDF for mock mode: the MOCK stand-in
 * for a set published in the CA application's Document Control module.
 * Built by hand (no PDF library): three 17×11 sheets with rooms, and a title
 * block in the bottom-right corner where `titleBlockLines` looks, so sheet
 * numbers are read on the device exactly as they are from a real set.
 */

export type MockSheet = { number: string; name: string; rooms: [number, number, number, number, string][] };

export const MOCK_SET_SHEETS: MockSheet[] = [
  {
    number: "A-101",
    name: "LEVEL 1 FLOOR PLAN (MOCK)",
    rooms: [
      [60, 420, 260, 300, "CLASSROOM 101"],
      [320, 420, 260, 300, "CLASSROOM 102"],
      [580, 420, 260, 300, "LIBRARY"],
      [60, 120, 380, 220, "GYMNASIUM"],
      [440, 120, 200, 220, "MECH 110"],
      [640, 120, 200, 220, "ADMIN"],
    ],
  },
  {
    number: "A-102",
    name: "LEVEL 2 FLOOR PLAN (MOCK)",
    rooms: [
      [60, 420, 390, 300, "CLASSROOM 201"],
      [450, 420, 390, 300, "CLASSROOM 202"],
      [60, 120, 260, 220, "SCIENCE LAB"],
      [320, 120, 260, 220, "ART"],
      [580, 120, 260, 220, "STORAGE 210"],
    ],
  },
  {
    number: "A-103",
    name: "ROOF PLAN (MOCK)",
    rooms: [[60, 120, 780, 600, "ROOF"]],
  },
];

const WIDTH = 1224;
const HEIGHT = 792;

const esc = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);

function pageContent(sheet: MockSheet, label: string): string {
  const ops: string[] = ["0.2 G 3 w"];
  for (const [x, y, w, h, name] of sheet.rooms) {
    ops.push(`${x} ${y} ${w} ${h} re S`);
    ops.push(`BT /F1 16 Tf ${x + 16} ${y + h / 2} Td (${esc(name)}) Tj ET`);
  }
  // Corridor between the two rows of rooms.
  ops.push(`60 340 780 80 re S`, `BT /F1 14 Tf 400 375 Td (CORRIDOR) Tj ET`);
  // Title block, right-hand strip.
  ops.push(`900 40 284 712 re S`, `900 40 284 160 re S`);
  ops.push(`BT /F1 12 Tf 916 700 Td (PARKHILL \\(MOCK\\)) Tj ET`);
  ops.push(`BT /F1 10 Tf 916 680 Td (${esc(label)}) Tj ET`);
  ops.push(`BT /F1 8 Tf 916 172 Td (SHEET TITLE) Tj ET`);
  ops.push(`BT /F1 12 Tf 916 150 Td (${esc(sheet.name)}) Tj ET`);
  ops.push(`BT /F1 36 Tf 916 70 Td (${esc(sheet.number)}) Tj ET`);
  ops.push(`0.78 0.06 0.18 rg BT /F1 14 Tf 60 760 Td (MOCK DRAWING SET - NOT A REAL PROJECT) Tj ET`);
  return ops.join("\n");
}

/** The PDF bytes. `label` (e.g. "v1 - 100% CD (MOCK)") is printed on every sheet. */
export function mockDrawingSetPdf(label: string, sheets: MockSheet[] = MOCK_SET_SHEETS): Uint8Array {
  const objects: string[] = [];
  const kids: number[] = [];
  // 1 catalog, 2 pages, 3 font; then a page and its content per sheet.
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  sheets.forEach((sheet, i) => {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    kids.push(pageId);
    const stream = pageContent(sheet, label);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Plain ASCII throughout, so string length is byte length.
  return new TextEncoder().encode(pdf);
}
