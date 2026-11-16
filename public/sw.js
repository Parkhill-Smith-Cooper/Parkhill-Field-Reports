/*
 * CA Field Reports service worker.
 *
 * Purpose: let CA screens the engineer has already opened load again with no
 * signal (a basement, a mechanical room, a site with no coverage). Captured
 * DATA is not stored here - photos, pins and drafts live in IndexedDB and are
 * synced by the app. This worker only keeps the app shell loadable.
 *
 * Registered with scope "/field-reports", so it controls CA pages only; CX
 * pages are never affected.
 *
 * Strategy:
 * - Pages, scripts, styles, fonts: NETWORK FIRST. Online, the engineer always
 *   gets the current version (this also keeps `next dev` working normally);
 *   the cache is only used when the network fails.
 * - Mock-mode CA files (/api/ca/files/...): CACHE FIRST. Their paths contain a
 *   unique id and never change, so photos seen once stay viewable offline.
 * - Every other /api/ request is left alone: data goes through the app's own
 *   offline store, never a stale HTTP cache.
 * - Only successful, same-origin, non-redirected responses are cached, so a
 *   sign-in redirect is never stored as if it were the page.
 */

const CACHE = "ca-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("ca-shell-") && name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function cacheable(response) {
  return response && response.ok && response.type === "basic" && !response.redirected;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (cacheable(response)) cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Build assets are content-hashed by file name; the dev server also adds a
    // per-render `?v=` query. Ignoring the query for them lets an offline page
    // find its scripts in both development and production.
    const isStatic = new URL(request.url).pathname.startsWith("/_next/static/");
    const hit = await cache.match(request, { ignoreVary: true, ignoreSearch: isStatic });
    if (hit) return hit;
    if (request.mode === "navigate") {
      // An unvisited CA page: fall back to the project list if we have it.
      const home = await cache.match("/field-reports", { ignoreVary: true });
      if (home) return home;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) cache.put(request, response.clone());
  return response;
}

/*
 * The page that registered this worker loaded BEFORE the worker controlled
 * it, so its HTML and scripts never passed through `fetch` below. The app
 * sends their URLs here once the worker is active, so the very first page
 * opened is available offline too - not only pages opened afterwards.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "ca-cache-urls" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        data.urls.map(async (raw) => {
          try {
            const url = new URL(raw, self.location.origin);
            if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
            const response = await fetch(url.href, { credentials: "same-origin" });
            if (cacheable(response)) await cache.put(url.href, response);
          } catch {
            // Best effort; the next online visit fills any gap.
          }
        }),
      );
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/ca/files/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(networkFirst(request));
});
