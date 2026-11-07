import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Azure App Service (Linux/Node) deployment: emits a
  // self-contained server bundle in .next/standalone.
  output: "standalone",

  // Loaded from node_modules at runtime instead of being bundled; exceljs
  // does not survive webpack bundling cleanly.
  serverExternalPackages: ["exceljs"],

  experimental: {
    // Recommended by the Chakra UI Next.js guide - keeps the barrel import of
    // @chakra-ui/react from pulling the whole library into every route.
    optimizePackageImports: ["@chakra-ui/react"],
  },
};

export default nextConfig;
