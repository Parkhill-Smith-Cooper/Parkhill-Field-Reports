import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE, readSessionToken } from "./auth/session";

/**
 * Who is performing the current request.
 *
 * Reads the SAML session established by `/api/saml/acs`. Every route handler
 * calls this for the `createdBy` field on the records it writes, so a project
 * or observation is always attributable to the engineer who created it.
 *
 * `src/middleware.ts` has already rejected unauthenticated requests to
 * `/api/*` before any handler runs, so a missing session here means something
 * has gone wrong rather than "anonymous access" - it throws rather than
 * silently attributing the record to nobody.
 */
export async function currentUser(): Promise<string> {
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    throw new Error(
      "No signed-in user for this request. This should have been rejected by " +
        "the middleware before reaching a route handler.",
    );
  }

  return session.upn;
}
