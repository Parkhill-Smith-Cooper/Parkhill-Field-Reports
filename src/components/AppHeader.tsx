import { Box, Flex, HStack } from "@chakra-ui/react";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";

import { CaNavSearch } from "@/components/ca/CaNavSearch";
import { FieldReportsMenu } from "@/components/FieldReportsMenu";
import { UserMenu } from "@/components/UserMenu";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";
import { APP_NAME, LOGO_SRC } from "@/lib/branding";
import { CA_HOME } from "@/lib/navigation";

/**
 * Application header.
 *
 * Mirrors the Parkhill + Tech hub's NavBar (parkhill-web-hub) so every
 * Parkhill app shares the same chrome: white bar with a soft drop shadow
 * rather than a border, the logo on the left, the account menu on the right.
 *
 * Sticky rather than fixed: a fixed header fights momentum scrolling on iOS
 * and can end up floating over content after the keyboard closes.
 */
export async function AppHeader() {
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value);

  return (
    <Box
      as="header"
      data-print="hide"
      position="sticky"
      top="0"
      zIndex="banner"
      bg="white"
      // The hub's light-mode nav shadow (useNavShadow).
      boxShadow="0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)"
      // The hub's spacing: 10px top, 18px bottom (its 10px plus the nav
      // wrapper's 8px), and full-width side padding of 10 / 20 tokens
      // (programGridPaddingX) rather than a centered max-width column.
      paddingTop="10px"
      paddingBottom="18px"
      paddingX={{ base: 10, xl: 20 }}
    >
      <Flex
        align="center"
        justify="space-between"
        gap="4"
      >
        <HStack gap={{ base: 2, md: 3 }} minW="0">
          <Link href={CA_HOME} aria-label={`${APP_NAME} home`}>
            <Box w={{ base: "120px", md: "130px" }} p={{ base: 2, md: 4 }}>
              <Image
                src={LOGO_SRC}
                alt="Parkhill Logo"
                width={250}
                height={85}
                priority
                style={{ width: "100%", height: "auto" }}
              />
            </Box>
          </Link>

          {/* The hub's logo carries its product name ("+ Tech"); this app's
              logo doesn't, so the name sits beside it - as the "Field
              Reports ⌄" switcher between CA and CX (CA_plan.pdf p.1). */}
          <FieldReportsMenu />
        </HStack>

        {/* CA only: renders nothing on CX pages. */}
        {session && <CaNavSearch />}

        {session && (
          <UserMenu name={session.name} email={session.email} />
        )}
      </Flex>
    </Box>
  );
}
