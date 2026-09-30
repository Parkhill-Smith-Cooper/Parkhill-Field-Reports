import { Box, Flex, HStack, Text } from "@chakra-ui/react";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";

import { UserMenu } from "@/components/UserMenu";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";
import { LOGO_SRC } from "@/lib/branding";

/**
 * Application header.
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
      zIndex="docked"
      bg="white"
      borderBottomWidth="1px"
      borderColor="line"
    >
      <Flex
        maxW="7xl"
        mx="auto"
        px={{ base: 4, md: 6 }}
        py={{ base: 3, md: 3.5 }}
        align="center"
        justify="space-between"
        gap="4"
      >
        <HStack gap={{ base: 3, md: 4 }} minW="0">
          <Link href="/projects" aria-label="ParkhillCXField home">
            <Image
              src={LOGO_SRC}
              alt="Parkhill"
              width={232}
              height={40}
              priority
              style={{ height: "1.75rem", width: "auto" }}
            />
          </Link>

          {/* The divider and product name collapse away on phones, where the
              logo alone is enough and horizontal space is scarce. */}
          <Box
            hideBelow="sm"
            alignSelf="stretch"
            borderLeftWidth="1px"
            borderColor="line"
          />
          <Text
            hideBelow="sm"
            fontSize="sm"
            fontWeight="semibold"
            letterSpacing="wide"
            color="fg.muted"
            textTransform="uppercase"
            whiteSpace="nowrap"
          >
            Commissioning Field
          </Text>
        </HStack>

        {session && (
          <UserMenu name={session.name} email={session.email} />
        )}
      </Flex>
    </Box>
  );
}
