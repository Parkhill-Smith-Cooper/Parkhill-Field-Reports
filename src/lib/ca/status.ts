import type { CaItemStatus, CaReportItem } from "@/types/ca";

/**
 * Observation item statuses. Only `deficient` is highlighted (red badge), and
 * only it triggers the report's "Notice of Deficient Items".
 */
export const CA_STATUS_LABELS: Record<CaItemStatus, string> = {
  "in-progress": "In Progress",
  complete: "Complete",
  deficient: "Deficient",
  corrected: "Corrected",
};

export function isDeficient(status: CaItemStatus): boolean {
  return status === "deficient";
}

export function hasDeficientItems(
  items: Pick<CaReportItem, "status">[],
): boolean {
  return items.some((item) => isDeficient(item.status));
}
