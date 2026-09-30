import { HStack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { LuChevronRight } from "react-icons/lu";

/**
 * Trail back out of a project. Kept small and quiet - it is orientation, not
 * a feature - and hidden from print, where the report header carries the
 * project identity instead.
 */
export function ProjectBreadcrumb({
  projectNumber,
  trailing,
}: {
  projectNumber: string;
  /** Final, non-linked crumb, e.g. "New observation". */
  trailing?: string;
}) {
  return (
    <HStack
      data-print="hide"
      gap="1.5"
      fontSize="sm"
      color="fg.muted"
      wrap="wrap"
    >
      <Text asChild _hover={{ color: "brand.fg" }}>
        <Link href="/projects">Projects</Link>
      </Text>

      <LuChevronRight aria-hidden />

      {trailing ? (
        <>
          <Text asChild _hover={{ color: "brand.fg" }}>
            <Link href={`/projects/${encodeURIComponent(projectNumber)}`}>
              {projectNumber}
            </Link>
          </Text>
          <LuChevronRight aria-hidden />
          <Text color="fg">{trailing}</Text>
        </>
      ) : (
        <Text color="fg">{projectNumber}</Text>
      )}
    </HStack>
  );
}
