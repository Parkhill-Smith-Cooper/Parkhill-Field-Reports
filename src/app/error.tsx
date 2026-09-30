"use client";

import { Box, Button, Code, Stack, Text } from "@chakra-ui/react";
import { LuRotateCcw } from "react-icons/lu";

import { PageShell } from "@/components/PageShell";

/**
 * Last-resort error screen.
 *
 * The specific case worth calling out is a missing environment variable: this
 * build has no offline mode, so an unconfigured checkout fails on its first
 * Cosmos or Blob call, and "Something went wrong" would send the reader
 * hunting. Naming the variable and pointing at the README turns that into a
 * one-minute fix.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isConfigError = error.message.startsWith(
    "Missing required environment variable",
  );

  return (
    <PageShell
      title={isConfigError ? "Azure configuration missing" : "Something went wrong"}
      description={
        isConfigError
          ? "The application could not reach its Azure resources because it has not been configured."
          : "The action could not be completed."
      }
    >
      <Stack gap="5" align="flex-start">
        {isConfigError ? (
          <Stack gap="3">
            <Code
              display="block"
              whiteSpace="pre-wrap"
              p="3"
              borderRadius="md"
              fontSize="sm"
            >
              {error.message}
            </Code>
            <Text fontSize="sm" color="fg.muted">
              Copy <Code size="sm">.env.example</Code> to{" "}
              <Code size="sm">.env.local</Code>, fill in the endpoints, and sign
              in with <Code size="sm">az login</Code>. The &ldquo;Azure
              setup&rdquo; section of the README has the full list, including
              the role assignments each resource needs.
            </Text>
          </Stack>
        ) : (
          <Box>
            <Text fontSize="sm" color="fg.muted">
              {error.message || "No further detail is available."}
            </Text>
          </Box>
        )}

        <Button colorPalette="brand" onClick={reset}>
          <LuRotateCcw />
          Try again
        </Button>
      </Stack>
    </PageShell>
  );
}
