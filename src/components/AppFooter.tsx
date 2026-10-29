import { Box, HStack, IconButton, Link, Stack, Text } from "@chakra-ui/react";
import { FaFacebook, FaGithub, FaInstagram, FaLinkedin } from "react-icons/fa";

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/16A1JZNMZE/?mibextid=wwXIfr",
    icon: FaFacebook,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/parkhill1945/",
    icon: FaInstagram,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/parkhill-1945/posts/?feedView=all",
    icon: FaLinkedin,
  },
  {
    label: "GitHub",
    href: "https://github.com/Parkhill-Smith-Cooper",
    icon: FaGithub,
  },
];

/**
 * Application footer, matching the hub's Footer (parkhill-web-hub) so every
 * Parkhill app ends the same way: support contact, social links, copyright.
 */
export function AppFooter() {
  return (
    <Box
      as="footer"
      data-print="hide"
      bg="white"
      color="fg"
      py={8}
      px={4}
      borderTopWidth="1px"
      borderColor="border.subtle"
    >
      <Stack gap={6} align="center">
        <Box textAlign="center">
          <Text fontSize="lg" fontWeight="bold">
            Parkhill + Tech
          </Text>
          <Text>
            Email:{" "}
            <Link href="mailto:techsolutions@parkhill.com">
              techsolutions@parkhill.com
            </Link>
          </Text>
          <Text>
            Phone: <Link href="tel:+18064732200">+1 (806) 473-2200</Link>
          </Text>
        </Box>

        <HStack gap={4}>
          {SOCIAL_LINKS.map(({ label, href, icon: SocialIcon }) => (
            <IconButton
              key={label}
              asChild
              aria-label={label}
              variant="ghost"
              colorPalette="gray"
            >
              <a href={href} target="_blank" rel="noopener noreferrer">
                <SocialIcon />
              </a>
            </IconButton>
          ))}
        </HStack>

        <Text fontSize="sm" textAlign="center" color="fg.muted">
          © {new Date().getFullYear()} Parkhill + Tech. All rights reserved.
        </Text>
      </Stack>
    </Box>
  );
}
