import { Badge } from "@chakra-ui/react";

import type { CaReportState } from "@/types/ca";

/** Draft / Issued · Rev N / Rev N issued · changes not issued. */
export function CaReportStateBadge({ state, latestRevision }: { state: CaReportState; latestRevision: number | null }) {
  if (state === "draft") {
    return (
      <Badge variant="outline" colorPalette="gray" size="md">
        Draft
      </Badge>
    );
  }
  if (state === "revising") {
    return (
      <Badge variant="subtle" colorPalette="orange" size="md">
        Rev {latestRevision} issued · changes not issued
      </Badge>
    );
  }
  return (
    <Badge variant="solid" colorPalette="green" size="md">
      Issued · Rev {latestRevision}
    </Badge>
  );
}
