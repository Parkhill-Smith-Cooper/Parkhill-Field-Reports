import "server-only";

import { CosmosClient, type Container } from "@azure/cosmos";

import { env } from "@/lib/env";

import { azureCredential } from "./credential";

/**
 * Cosmos DB access.
 *
 * The client is created lazily and cached on `globalThis`, for the same reasons
 * as the credential: Next's dev hot reload re-evaluates this module on every
 * edit, and a new `CosmosClient` per reload rebuilds the connection pool.
 *
 * Containers are assumed to already exist - they are infrastructure, created
 * once with the correct partition key, not something the app should create at
 * runtime. See "Azure setup" in the README.
 */

declare global {
  var __cxFieldCosmos: CosmosClient | undefined;
}

function client(): CosmosClient {
  globalThis.__cxFieldCosmos ??= new CosmosClient({
    endpoint: env.cosmosEndpoint,
    aadCredentials: azureCredential(),
  });
  return globalThis.__cxFieldCosmos;
}

export function projectsContainer(): Container {
  return client()
    .database(env.cosmosDatabase)
    .container(env.cosmosProjectsContainer);
}

export function observationsContainer(): Container {
  return client()
    .database(env.cosmosDatabase)
    .container(env.cosmosObservationsContainer);
}

/** Cosmos surfaces "already exists" and "not found" as HTTP codes on the error. */
export function cosmosStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "number") return code;
    if (typeof code === "string") {
      const parsed = Number(code);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
  }
  return undefined;
}
