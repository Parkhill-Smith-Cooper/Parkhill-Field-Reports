"use client";

import { Box, HStack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuCamera, LuFileText, LuRoute } from "react-icons/lu";

import { CA_PROJECT_TABS, caProjectPath, type CaProjectTab } from "@/lib/ca/routes";

const ICONS: Record<CaProjectTab, React.ReactNode> = {
  capture: <LuCamera />,
  reports: <LuFileText />,
  route: <LuRoute />,
};

/**
 * Capture · Reports · Site Route. Each tab is a real route, so the phone's
 * back gesture walks between tabs instead of leaving the app. Equal-width,
 * 56px-tall targets: usable with gloves.
 */
export function CaProjectTabs({ projectNumber }: { projectNumber: string }) {
  const pathname = usePathname();

  return (
    <HStack
      as="nav"
      aria-label="Project sections"
      data-print="hide"
      gap="0"
      borderBottomWidth="1px"
      borderColor="line"
      mx={{ base: -4, md: 0 }}
    >
      {CA_PROJECT_TABS.map((tab) => {
        const href = caProjectPath(projectNumber, tab.key);
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Box
            key={tab.key}
            asChild
            flex="1"
            minH="56px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderBottomWidth="3px"
            borderColor={active ? "brand.solid" : "transparent"}
            color={active ? "brand.fg" : "fg.muted"}
            fontWeight={active ? "bold" : "medium"}
            _hover={{ color: "brand.fg", bg: "surface.muted" }}
            _focusVisible={{ outline: "2px solid", outlineColor: "brand.focusRing", outlineOffset: "-2px" }}
          >
            <Link href={href} aria-current={active ? "page" : undefined}>
              <HStack gap="2">
                <Box aria-hidden fontSize="lg">
                  {ICONS[tab.key]}
                </Box>
                <Text fontSize={{ base: "sm", md: "md" }}>{tab.label}</Text>
              </HStack>
            </Link>
          </Box>
        );
      })}
    </HStack>
  );
}
