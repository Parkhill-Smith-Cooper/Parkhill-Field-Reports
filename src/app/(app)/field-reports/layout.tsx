import { connection } from "next/server";

import { CaModeBanner } from "@/components/ca/CaModeBanner";
import { CaOfflineSupport } from "@/components/ca/CaOfflineSupport";
import { caRuntimeInfo } from "@/repositories/ca";

/**
 * Layout for every CA Field Reports screen.
 *
 * Reads the CA wiring on the server (no secrets involved) so the mock-data
 * banner is part of the first paint rather than appearing after a fetch.
 * `connection()` makes this render per request: the mode comes from runtime
 * configuration and must never be baked in at build time.
 */
export default async function CaLayout({ children }: { children: React.ReactNode }) {
  await connection();

  let mode: "mock" | "azure" | null = null;
  let configError: string | undefined;
  try {
    mode = caRuntimeInfo().dataMode;
  } catch (error) {
    configError = error instanceof Error ? error.message : "Unknown configuration error.";
  }

  return (
    <>
      <CaModeBanner mode={mode} configError={configError} />
      <CaOfflineSupport />
      {children}
    </>
  );
}
