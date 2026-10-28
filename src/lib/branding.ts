/**
 * Brand assets referenced by more than one component.
 *
 * This lives in its own module rather than alongside the header because both a
 * server component (the application header, which reads the session) and a
 * client component (the report preview) need it. Exporting it from the header
 * would drag `next/headers` into the client bundle and fail the build.
 *
 * To swap the logo, replace `public/parkhill-logo.png` and keep the file name.
 * The application header, the sign-in page and the report all follow the one
 * line below, and all size by height with automatic width, so any aspect ratio
 * works. The browser tab icon is separate: `src/app/favicon.ico`.
 */
export const LOGO_SRC = "/parkhill-logo.png";

/** The product name shown in the header, the sign-in page and the tab title. */
export const APP_NAME = "Field Reports";
