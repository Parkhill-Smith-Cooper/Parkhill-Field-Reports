/**
 * Top-level destinations, shared by server and client components.
 *
 * CA Field Reports is the default experience: sign-in, the logo and the main
 * "Field Reports" button land there. CX Field Reports keeps its original
 * `/projects` URLs, so existing links and bookmarks keep working.
 */
export const CA_HOME = "/field-reports";
export const CX_HOME = "/projects";

/** Where a signed-in engineer lands when no other destination was requested. */
export const DEFAULT_LANDING = CA_HOME;

export type Section = "ca" | "cx";

export function sectionForPath(pathname: string | null | undefined): Section {
  return pathname === CX_HOME || pathname?.startsWith(`${CX_HOME}/`) ? "cx" : "ca";
}
