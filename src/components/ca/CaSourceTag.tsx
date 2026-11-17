import { Badge } from "@chakra-ui/react";

import type { CaProjectSourceKind } from "@/types/ca";

const LABELS: Record<CaProjectSourceKind, string> = {
  mock: "Mock",
  "ca-app": "CA app",
  vantagepoint: "VantagePoint",
  manual: "Manual",
};

/**
 * Where a record came from. Mock records are tagged loudly (yellow) so sample
 * data can never be mistaken for a real project.
 */
export function CaSourceTag({ source }: { source: CaProjectSourceKind | "upload" }) {
  if (source === "mock") {
    return (
      <Badge bg="yellow.300" color="black" size="sm" fontWeight="bold">
        MOCK
      </Badge>
    );
  }
  return (
    <Badge variant="subtle" colorPalette="gray" size="sm">
      {source === "upload" ? "Uploaded" : LABELS[source]}
    </Badge>
  );
}
