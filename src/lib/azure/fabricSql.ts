import "server-only";

import sql from "mssql";

import { env } from "@/lib/env";

import { azureCredential } from "./credential";

/**
 * Read-only access to the data team's **Microsoft Fabric** SQL endpoint, which
 * holds the nightly VantagePoint sync - the same source the construction admin
 * app (parkhill-ccr) uses for its project picker.
 *
 * Fabric speaks TDS, so `mssql` connects to it like any SQL Server, but access
 * is a Fabric *workspace role* granted to the signing-in identity (the managed
 * identity in Azure, `az login` locally), not a T-SQL grant. Missing access
 * surfaces as `ESOCKET` / "socket hang up": a permissions failure that reads
 * like a network one.
 *
 * The pool is cached on `globalThis` for the same hot-reload reasons as the
 * Cosmos client, and discarded on error so a dead pool is never reused.
 */

declare global {
  var __cxFieldFabricPool: Promise<sql.ConnectionPool> | undefined;
}

function pool(): Promise<sql.ConnectionPool> {
  globalThis.__cxFieldFabricPool ??= new sql.ConnectionPool({
    server: env.fabricSqlServer,
    database: env.fabricSqlDatabase,
    authentication: {
      type: "token-credential",
      options: { credential: azureCredential() },
    },
    options: { encrypt: true, trustServerCertificate: false },
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    pool: { min: 0, max: 5, idleTimeoutMillis: 300_000 },
  })
    .connect()
    .then((connected) => {
      connected.on("error", (error: Error) => {
        console.error("[ParkhillCXField] Fabric SQL pool error", error);
        globalThis.__cxFieldFabricPool = undefined;
      });
      return connected;
    })
    .catch((error: unknown) => {
      globalThis.__cxFieldFabricPool = undefined;
      throw error;
    });
  return globalThis.__cxFieldFabricPool;
}

const CONNECTION_ERRORS = new Set([
  "ETIMEOUT",
  "ECONNCLOSED",
  "ECONNRESET",
  "ESOCKET",
  "ELOGIN",
]);

function isConnectionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    CONNECTION_ERRORS.has(String((error as { code?: unknown }).code ?? ""))
  );
}

/** Runs a query, retrying once with a fresh pool on a connection-class failure. */
export async function fabricQuery<T>(text: string): Promise<T[]> {
  const run = async () => (await (await pool()).request().query<T>(text)).recordset;

  try {
    return await run();
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    globalThis.__cxFieldFabricPool = undefined;
    return run();
  }
}
