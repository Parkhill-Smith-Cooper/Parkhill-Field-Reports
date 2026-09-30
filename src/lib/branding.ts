/**
 * Brand assets referenced by more than one component.
 *
 * This lives in its own module rather than alongside the header because both a
 * server component (the application header, which reads the session) and a
 * client component (the report preview) need it. Exporting it from the header
 * would drag `next/headers` into the client bundle and fail the build.
 *
 * To swap the logo, replace `public/parkhill-logo.svg` and keep the file name.
 * If the official asset is a PNG, add it as `parkhill-logo.png` and change the
 * one line below - both the application header and the report follow it, and
 * both size by height with automatic width, so any aspect ratio works.
 */
export const LOGO_SRC = "/parkhill-logo.svg";
