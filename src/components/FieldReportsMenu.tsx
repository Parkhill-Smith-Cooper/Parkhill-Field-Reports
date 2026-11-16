"use client";

import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Menu,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuCheck, LuChevronDown } from "react-icons/lu";

import { APP_NAME } from "@/lib/branding";
import { CA_HOME, CX_HOME, sectionForPath, type Section } from "@/lib/navigation";

/**
 * The "Field Reports ⌄" control in the application header (CA_plan.pdf p.1).
 *
 * - The label opens CA Field Reports, the default experience.
 * - The chevron opens a menu to switch between CA Field Reports and CX Field
 *   Reports. The CX app keeps its own URLs (`/projects/...`).
 * - A badge always says which side the engineer is on, so the two never get
 *   confused. On phones the label is hidden for space and the badge becomes
 *   the menu button itself.
 */

const SECTIONS: { key: Section; label: string; href: string; hint: string }[] = [
  {
    key: "ca",
    label: "CA Field Reports",
    href: CA_HOME,
    hint: "Construction administration observations",
  },
  {
    key: "cx",
    label: "CX Field Reports",
    href: CX_HOME,
    hint: "Commissioning observations and diagnostics",
  },
];

export function FieldReportsMenu() {
  const active = sectionForPath(usePathname());

  return (
    <HStack gap={{ base: 1, sm: 2 }} minW="0">
      {/* Matches the app title in the CA app (parkhill-ccr): a md heading in
          the system font rather than this app's Inter. */}
      <Heading
        asChild
        hideBelow="sm"
        size="md"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        whiteSpace="nowrap"
        _hover={{ color: "brand.fg" }}
      >
        <Link href={CA_HOME}>{APP_NAME}</Link>
      </Heading>

      <Menu.Root positioning={{ placement: "bottom-start" }}>
        <Menu.Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            minH="44px"
            px="2"
            aria-label={`Switch field reports. Currently ${active === "ca" ? "CA" : "CX"} Field Reports.`}
          >
            <SectionBadge section={active} />
            <LuChevronDown />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="260px" p="2" rounded="xl" shadow="lg">
              {SECTIONS.map((section) => (
                <Menu.Item
                  key={section.key}
                  value={section.key}
                  asChild
                  rounded="lg"
                  px="3"
                  py="2.5"
                  cursor="pointer"
                >
                  <Link href={section.href} aria-current={section.key === active ? "page" : undefined}>
                    <HStack justify="space-between" width="full" gap="3">
                      <Stack gap="0">
                        <Text fontWeight="semibold">{section.label}</Text>
                        <Text fontSize="xs" color="fg.muted">
                          {section.hint}
                        </Text>
                      </Stack>
                      <Box color="brand.solid" visibility={section.key === active ? "visible" : "hidden"}>
                        <LuCheck />
                      </Box>
                    </HStack>
                  </Link>
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </HStack>
  );
}

/** Small "which side am I on" line above a top-level page title. */
export function SectionEyebrow({ section }: { section: Section }) {
  return (
    <HStack gap="2" data-print="hide">
      <SectionBadge section={section} />
      <Text fontSize="sm" color="fg.muted" fontWeight="medium">
        {section === "ca" ? "CA Field Reports" : "CX Field Reports"}
      </Text>
    </HStack>
  );
}

/** CA is solid brand red; CX is outlined, so the two read differently at a glance. */
export function SectionBadge({ section }: { section: Section }) {
  return section === "ca" ? (
    <Badge colorPalette="brand" variant="solid" size="md" letterSpacing="wide">
      CA
    </Badge>
  ) : (
    <Badge variant="outline" colorPalette="gray" size="md" letterSpacing="wide">
      CX
    </Badge>
  );
}
