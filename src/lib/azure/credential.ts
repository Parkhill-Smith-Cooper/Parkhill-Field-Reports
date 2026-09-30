import "server-only";

import { DefaultAzureCredential } from "@azure/identity";

/**
 * The single Azure credential for the process.
 *
 * `DefaultAzureCredential` resolves to the App Service system-assigned managed
 * identity in Azure, and to the developer's `az login` session locally. That is
 * why there are no keys or connection strings anywhere in this repository.
 *
 * Cached on `globalThis` because Next re-evaluates modules on every hot reload
 * in development; a fresh credential per reload re-runs token acquisition and
 * leaks sockets.
 */

declare global {
  var __cxFieldCredential: DefaultAzureCredential | undefined;
}

export function azureCredential(): DefaultAzureCredential {
  globalThis.__cxFieldCredential ??= new DefaultAzureCredential();
  return globalThis.__cxFieldCredential;
}
