import {
  LOG_COLORS,
  LOG_COLUMNS,
  LOG_TITLE,
  buildDeficiencyLogRows,
  formatLogDate,
  logSubtitle,
} from "@/lib/deficiencyLog";
import type { SavedObservation } from "@/types";

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
];

/**
 * Builds the deficiency log as a PDF in the browser and downloads it. The
 * libraries are imported on demand so they cost nothing until someone exports.
 */
export async function downloadDeficiencyLogPdf(
  projectNumber: string,
  projectName: string | undefined,
  observations: SavedObservation[],
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const rows = buildDeficiencyLogRows(observations);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  const drawBanner = () => {
    doc.setFont("times", "bold");
    doc.setFillColor(...rgb(LOG_COLORS.titleBar));
    doc.rect(0, 0, pageWidth, 34, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(LOG_TITLE, margin, 24);

    doc.setFillColor(...rgb(LOG_COLORS.subtitleBar));
    doc.rect(0, 34, pageWidth, 20, "F");
    doc.setFontSize(9);
    doc.text(logSubtitle(projectNumber, projectName), margin, 47);
  };

  const dateIndex = LOG_COLUMNS.findIndex((c) => c.key === "date");
  const statusIndex = LOG_COLUMNS.findIndex((c) => c.key === "status");

  autoTable(doc, {
    startY: 66,
    margin: { top: 66, left: margin, right: margin, bottom: 36 },
    head: [LOG_COLUMNS.map((c) => c.header)],
    body: rows.map((row) =>
      LOG_COLUMNS.map((c) =>
        c.key === "date" ? formatLogDate(row.date) : String(row[c.key]),
      ),
    ),
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.5,
      cellPadding: 3,
      valign: "top",
      lineColor: rgb(LOG_COLORS.rowRule),
      lineWidth: 0.4,
      textColor: 0,
    },
    headStyles: {
      fillColor: rgb(LOG_COLORS.titleBar),
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      lineColor: rgb(LOG_COLORS.titleBar),
    },
    bodyStyles: { fillColor: rgb(LOG_COLORS.rowBlue) },
    alternateRowStyles: { fillColor: rgb(LOG_COLORS.rowGrey) },
    columnStyles: {
      0: { halign: "right", cellWidth: 20 },
      [dateIndex]: { halign: "right", cellWidth: 48 },
    },
    // Banner and header repeat on every page.
    showHead: "everyPage",
    didDrawPage: drawBanner,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === statusIndex) {
        data.cell.styles.fillColor = rgb(LOG_COLORS.flagPink);
      }
    },
  });

  // The red closing line, then page numbers on every page.
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;
  let closeY = endY + 14;
  if (closeY > pageHeight - 46) {
    doc.addPage();
    drawBanner();
    closeY = 74;
  }
  doc.setDrawColor(...rgb(LOG_COLORS.titleBar));
  doc.setLineWidth(1.5);
  doc.line(margin, closeY, pageWidth - margin, closeY);

  const pages = doc.getNumberOfPages();
  doc.setFont("times", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 16, {
      align: "right",
    });
  }

  doc.save(`Deficiency Log - ${projectNumber}.pdf`);
}
