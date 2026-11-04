import { Box } from "@chakra-ui/react";

/**
 * The red rule that closes a printed report. `avoid-break` keeps it from being
 * stranded alone at the top of a page by a split.
 */
export function ReportClosing() {
  return (
    <Box data-print="avoid-break" pt="2">
      <Box borderBottomWidth="2px" borderColor="brand.solid" />
    </Box>
  );
}
