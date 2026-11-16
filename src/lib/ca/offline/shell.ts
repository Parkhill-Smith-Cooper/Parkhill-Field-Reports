"use client";

/**
 * Asks the CA service worker (public/sw.js) to keep pages - and the scripts
 * and styles they use - for offline use. Best effort and online only; does
 * nothing where service workers are unavailable.
 */
export function keepForOffline(urls: string[]): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !navigator.onLine) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: "ca-cache-urls", urls }))
    .catch(() => undefined);
}
