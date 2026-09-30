"use client";

import { Box, Button, HStack, Menu, Portal, Text } from "@chakra-ui/react";
import { LuLogOut, LuUser } from "react-icons/lu";

/**
 * The signed-in engineer, and the way out.
 *
 * On desktop the name is visible; on a phone it collapses to an icon button,
 * because the header there has room for the logo and little else.
 */
export function UserMenu({ name, email }: { name: string; email: string }) {
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <Button variant="ghost" size="sm" colorPalette="gray" px={{ base: 2, sm: 3 }}>
          <LuUser />
          <Text hideBelow="sm" maxW="40" truncate>
            {name}
          </Text>
        </Button>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="56">
            <Box px="3" py="2">
              <Text fontSize="sm" fontWeight="medium" truncate>
                {name}
              </Text>
              <Text fontSize="xs" color="fg.muted" truncate>
                {email}
              </Text>
            </Box>
            <Menu.Separator />
            <Menu.Item value="sign-out" asChild>
              {/* A link rather than a fetch: sign-out is a navigation, and it
                  must still work if the route ends with a redirect to Entra
                  for single logout. */}
              <a href="/api/saml/logout">
                <HStack gap="2">
                  <LuLogOut />
                  <Text>Sign out</Text>
                </HStack>
              </a>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
