import { Box, Flex } from "@chakra-ui/react";

import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";

/**
 * Layout for the signed-in application.
 *
 * The header and footer live here rather than in the root layout so the
 * sign-in page stays a bare page with a single action - it renders its own
 * logo, and a second one in a header above it read as a mistake.
 *
 * The column fills the viewport so the footer sits at the bottom of short
 * pages instead of floating mid-screen.
 *
 * Access is enforced by `src/middleware.ts`, not here: a layout is the wrong
 * place for an access check, because it runs after the route has already been
 * matched.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" minH="100dvh">
      <AppHeader />
      <Box flex="1">{children}</Box>
      <AppFooter />
    </Flex>
  );
}
