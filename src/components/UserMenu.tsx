"use client";

import {
  Avatar,
  Box,
  Button,
  HStack,
  Icon,
  Menu,
  Portal,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { FaUser } from "react-icons/fa";
import { LuChevronDown, LuLogOut } from "react-icons/lu";

/**
 * The signed-in engineer, and the way out.
 *
 * Styled to match the hub's UserMenu (parkhill-web-hub). On desktop the name
 * is visible; on a phone it collapses to the icon, because the header there
 * has room for the logo and little else.
 *
 * The Entra profile photo sits in a green ring, as in parkhill-ccr; without
 * one (no photo, or Graph unavailable) the plain user icon stays.
 */
export function UserMenu({ name, email }: { name: string; email: string }) {
  const [hasPhoto, setHasPhoto] = useState(true);

  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          px={{ base: 1, md: 2 }}
          aria-label="Account menu"
          title={name}
        >
          <HStack gap={2} align="center">
            {hasPhoto ? (
              <Avatar.Root
                size="sm"
                borderWidth="2px"
                borderColor="green.400"
                bg="gray.200"
                onStatusChange={(details) =>
                  details.status === "error" && setHasPhoto(false)
                }
              >
                <Avatar.Fallback name={name} />
                <Avatar.Image src="/api/me/photo" alt="" />
              </Avatar.Root>
            ) : (
              <Icon as={FaUser} boxSize={4} />
            )}
            <Text
              hideBelow="md"
              fontSize="sm"
              fontWeight="bold"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              maxW="180px"
            >
              {name}
            </Text>
            <LuChevronDown />
          </HStack>
        </Button>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content
            minW="220px"
            p="2"
            display="flex"
            flexDirection="column"
            gap="1"
            rounded="2xl"
            shadow="lg"
            borderWidth="1px"
          >
            <Box px="4" py="1.5">
              <Text fontSize="sm" fontWeight="bold" truncate>
                {name}
              </Text>
              <Text fontSize="xs" color="fg.muted" truncate>
                {email}
              </Text>
            </Box>
            <Menu.Separator />
            <Menu.Item
              value="sign-out"
              asChild
              rounded="xl"
              px="4"
              py="1.75"
              cursor="pointer"
            >
              {/* A link rather than a fetch: sign-out is a navigation, and it
                  must still work if the route ends with a redirect to Entra
                  for single logout. */}
              <a href="/api/saml/logout">
                <LuLogOut />
                Sign Out
              </a>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
