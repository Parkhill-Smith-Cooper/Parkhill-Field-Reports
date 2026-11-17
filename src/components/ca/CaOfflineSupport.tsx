"use client";

import { useEffect } from "react";

import { startCaAutoSync } from "@/lib/ca/offline/appSync";

/**
 * Mounted once by the CA layout:
 *
 * - starts background-while-open sync of anything captured on this device;
 * - registers the service worker that keeps CA screens loadable offline.
 *   Its scope is `/field-reports` only, so CX pages are never controlled by it.
 * - hands the worker this page's own URL and script/style URLs. The page
 *   loaded before the worker existed, so without this the first CA page an
 *   engineer opens would not be available offline.
 */
export function CaOfflineSupport() {
  useEffect(() => {
    startCaAutoSync();
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/field-reports" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => {
            const url = new URL(name, location.origin);
            return (
              url.origin === location.origin &&
              (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image"))
            );
          });
        registration.active?.postMessage({
          type: "ca-cache-urls",
          urls: [location.href, "/field-reports", ...assets],
        });
      })
      .catch((error) => console.warn("[CA offline] Service worker registration failed", error));
  }, []);
  return null;
}
