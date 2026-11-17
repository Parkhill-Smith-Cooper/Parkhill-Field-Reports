import { loadEnvConfig } from "@next/env";
import { test as base, type BrowserContext } from "@playwright/test";

import {
  SESSION_COOKIE,
  createSessionToken,
} from "../../../src/lib/auth/session";

/**
 * Signs a test session with the app's own signer and the local
 * SESSION_SECRET, then sets it as the session cookie. No bypass exists in the
 * application: this produces exactly what `/api/saml/acs` would have issued.
 *
 * The secret is read from .env / .env.local by Next's own loader and never
 * printed.
 */
loadEnvConfig(process.cwd());

export const TEST_USER = {
  sub: "00000000-0000-0000-0000-00000000e2e0",
  upn: "e2e.engineer@parkhill.com",
  email: "e2e.engineer@parkhill.com",
  name: "E2E Engineer",
  tid: "00000000-0000-0000-0000-000000000000",
  nameId: "e2e.engineer@parkhill.com",
};

export async function signIn(context: BrowserContext, baseURL: string) {
  const token = await createSessionToken(TEST_USER);
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  // The header's avatar asks Microsoft Graph for a photo; never in tests.
  await context.route("**/api/me/photo", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
}

export const test = base.extend({
  // `provide` is Playwright's fixture callback (named `use` in its docs);
  // renamed so the React hooks lint rule does not mistake it for a hook.
  context: async ({ context, baseURL }, provide) => {
    await signIn(context, baseURL!);
    await provide(context);
  },
});

export { expect } from "@playwright/test";
