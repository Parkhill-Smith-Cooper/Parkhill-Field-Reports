import { Box, HStack, Text } from "@chakra-ui/react";
import { LuDatabase, LuTriangleAlert } from "react-icons/lu";

/**
 * Says plainly when CA Field Reports is NOT connected to Parkhill systems.
 *
 * Shown on every CA screen while `CA_DATA_MODE=mock`, and whenever the CA
 * configuration is invalid. In `azure` mode with a valid configuration it
 * renders nothing. High-contrast and full-width so it reads in sunlight.
 */
export function CaModeBanner({
  mode,
  configError,
}: {
  mode: "mock" | "azure" | null;
  configError?: string;
}) {
  if (configError) {
    return (
      <Banner tone="error" icon={<LuTriangleAlert />}>
        <b>CA Field Reports is misconfigured.</b> {configError}
      </Banner>
    );
  }
  if (mode !== "mock") return null;
  return (
    <Banner tone="mock" icon={<LuDatabase />}>
      <b>MOCK DATA</b> — sample data stored on this server only. Nothing here is
      saved to Parkhill systems.
    </Banner>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "mock" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box
      role="status"
      data-testid="ca-mode-banner"
      data-print="hide"
      bg={tone === "mock" ? "yellow.300" : "red.700"}
      color={tone === "mock" ? "black" : "white"}
      px={{ base: 4, md: 6 }}
      py="2"
    >
      <HStack gap="2" justify="center" fontSize="sm" textAlign="center">
        <Box flexShrink="0" aria-hidden>
          {icon}
        </Box>
        <Text>{children}</Text>
      </HStack>
    </Box>
  );
}
