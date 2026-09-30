"use client";

import { ChakraProvider } from "@chakra-ui/react";

import { system } from "@/theme";

/**
 * The application is deliberately light-mode only: the design is a white
 * document on white chrome, and a dark variant would be dead weight.
 *
 * Chakra v3's `_dark` condition is a pure class selector (`.dark &`) with no
 * `prefers-color-scheme` component, so simply not installing `next-themes`
 * means no dark style can ever match - there is nothing to switch off. The
 * `light` class on <html> in the root layout asserts that explicitly.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
