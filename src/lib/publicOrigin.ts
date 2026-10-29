/**
 * The origin to build redirects against.
 *
 * Behind App Service's front end, `request.url` carries the container's
 * internal address (e.g. `http://32da80880082:8080`), not the public host, so
 * a redirect built from it sends the browser somewhere unreachable.
 * APP_BASE_URL is the public URL by definition - it is already what Entra is
 * registered against - so it wins whenever it is set. The request origin is
 * only a fallback for an unconfigured local run.
 *
 * Kept free of `server-only` and node-saml so the proxy can import it.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.APP_BASE_URL?.replace(/\/$/, "");
  return configured || new URL(request.url).origin;
}
