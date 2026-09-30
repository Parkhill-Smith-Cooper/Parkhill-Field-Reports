import { Box, Container, Heading, Stack, Text } from "@chakra-ui/react";

type PageShellProps = {
  title: string;
  /** Short line under the title. Kept to one sentence. */
  description?: string;
  /** Breadcrumb / project context rendered above the title. */
  eyebrow?: React.ReactNode;
  /** Actions aligned with the title on desktop, stacked beneath it on mobile. */
  actions?: React.ReactNode;
  /** `md` for forms, `5xl` for the report and list screens. */
  width?: "md" | "3xl" | "5xl";
  children: React.ReactNode;
};

const WIDTHS = {
  md: "3xl",
  "3xl": "4xl",
  "5xl": "6xl",
} as const;

/**
 * The single page wrapper every screen uses, so the responsive rules that make
 * this usable in the field are applied once rather than per page:
 *
 * - `minH="100dvh"` uses the *dynamic* viewport height, so the iOS keyboard
 *   shrinking the visual viewport does not clip the bottom of the page.
 * - Nothing here sets a fixed height or `overflow: hidden`, so the page always
 *   scrolls and focused inputs can always be scrolled into view.
 * - Generous bottom padding keeps the last control clear of the home
 *   indicator and any browser chrome.
 */
export function PageShell({
  title,
  description,
  eyebrow,
  actions,
  width = "md",
  children,
}: PageShellProps) {
  return (
    <Box as="main" minH="100dvh" bg="white">
      <Container maxW={WIDTHS[width]} px={{ base: 4, md: 6 }} py={{ base: 5, md: 8 }} pb={{ base: 16, md: 20 }}>
        <Stack gap={{ base: 5, md: 7 }}>
          {/* The eyebrow carries the breadcrumb and, in the wizard, the step
              indicator - both need clear separation from the page title. */}
          <Stack gap={{ base: 5, md: 6 }}>
            {eyebrow}
            {/*
              Hidden from print. The page title and its hint are application
              chrome ("Report Preview", "Click any text to edit it..."); the
              report carries its own header, and printing both reads as a
              screenshot of a web page rather than as a field report.
            */}
            <Stack
              data-print="hide"
              direction={{ base: "column", md: "row" }}
              justify="space-between"
              align={{ base: "stretch", md: "flex-end" }}
              gap={{ base: 3, md: 6 }}
            >
              <Stack gap="1" minW="0">
                <Heading
                  as="h1"
                  size={{ base: "lg", md: "xl" }}
                  fontWeight="semibold"
                  letterSpacing="-0.01em"
                >
                  {title}
                </Heading>
                {description && (
                  <Text fontSize={{ base: "sm", md: "md" }} color="fg.muted">
                    {description}
                  </Text>
                )}
              </Stack>
              {actions && <Box flexShrink="0">{actions}</Box>}
            </Stack>
          </Stack>

          {children}
        </Stack>
      </Container>
    </Box>
  );
}
