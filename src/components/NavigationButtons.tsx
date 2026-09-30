"use client";

import { Button, Stack } from "@chakra-ui/react";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";

type NavigationButtonsProps = {
  backLabel?: string;
  onBack?: () => void;
  nextLabel: string;
  onNext: () => void;
  nextLoading?: boolean;
  nextDisabled?: boolean;
  /** Replaces the forward arrow, e.g. a save icon on the final step. */
  nextIcon?: React.ReactNode;
};

/**
 * Step navigation.
 *
 * Rendered inline at the end of the content flow, never as a fixed bottom bar.
 * On a phone a fixed bar sits underneath the on-screen keyboard and covers the
 * very field being typed into; inline buttons scroll with the form and stay
 * reachable. Full-width and stacked on mobile for comfortable thumb targets,
 * right-aligned on desktop.
 *
 * The primary action is listed first in the DOM and reversed visually on
 * desktop, so keyboard and screen-reader users reach the primary action first
 * while sighted desktop users still see it on the right.
 */
export function NavigationButtons({
  backLabel = "Back",
  onBack,
  nextLabel,
  onNext,
  nextLoading = false,
  nextDisabled = false,
  nextIcon,
}: NavigationButtonsProps) {
  return (
    <Stack
      data-print="hide"
      direction={{ base: "column", sm: "row-reverse" }}
      justify={{ sm: "flex-start" }}
      gap="3"
      pt="2"
    >
      <Button
        colorPalette="brand"
        size={{ base: "lg", md: "md" }}
        width={{ base: "full", sm: "auto" }}
        loading={nextLoading}
        disabled={nextDisabled}
        onClick={onNext}
      >
        {nextLabel}
        {nextIcon ?? <LuArrowRight />}
      </Button>

      {onBack && (
        <Button
          variant="outline"
          size={{ base: "lg", md: "md" }}
          width={{ base: "full", sm: "auto" }}
          disabled={nextLoading}
          onClick={onBack}
        >
          <LuArrowLeft />
          {backLabel}
        </Button>
      )}
    </Stack>
  );
}
