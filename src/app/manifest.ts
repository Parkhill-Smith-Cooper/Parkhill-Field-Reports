import type { MetadataRoute } from "next";

/**
 * Web app manifest, so CA Field Reports can be added to a phone's home
 * screen. Installing matters on iPhones: Safari is far less likely to evict
 * the on-device photo store of an installed web app.
 *
 * Served without a session (excluded in src/proxy.ts): browsers fetch the
 * manifest without cookies, and it contains nothing sensitive.
 *
 * The icon is a placeholder until an official square Parkhill asset exists.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parkhill Field Reports",
    short_name: "Field Reports",
    description: "Construction administration field observations and reports.",
    start_url: "/field-reports",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#C8102E",
    icons: [{ src: "/ca-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
