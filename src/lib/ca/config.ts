import "server-only";

/**
 * CA Field Reports configuration.
 *
 * Kept apart from `src/lib/env.ts` (the CX configuration) so CA settings can
 * evolve without touching CX. Same pattern: read lazily, validated on first
 * use, and a bad value produces a sentence naming the variable.
 *
 * Mode switches:
 *
 * | Variable            | Values                        | Default                                  |
 * | ------------------- | ----------------------------- | ---------------------------------------- |
 * | `CA_DATA_MODE`      | `mock` · `azure`              | `mock` in development; REQUIRED in production |
 * | `CA_PROJECT_SOURCE` | `mock` · `vantagepoint` · `ca-app` · `none` | `mock` in mock mode, else `ca-app` |
 * | `CA_PROJECT_FALLBACK_SOURCE` | `vantagepoint` · `mock` · `none` | `none` in mock mode, else `vantagepoint` |
 * | `CA_DRAWING_SOURCE` | `mock` · `ca-app` · `none`    | `mock` in mock mode, else `ca-app`       |
 * | `CA_SHEET_NAMING`   | `openai` · `mock` · `none`    | `openai` when `OPENAI_API_KEY` is set, else `none` |
 *
 * `azure` mode never falls back to mock data. If Azure is misconfigured the
 * request fails with a message naming the missing variable, exactly as CX
 * does - a silent fallback would let someone file a real report into a
 * throwaway store.
 */

export type CaDataMode = "mock" | "azure";
export type CaProjectSourceMode = "mock" | "vantagepoint" | "ca-app" | "none";
export type CaProjectFallbackMode = "vantagepoint" | "mock" | "none";
export type CaDrawingSourceMode = "mock" | "ca-app" | "none";
export type CaSheetNamingMode = "openai" | "mock" | "none";

function readEnum<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: () => T,
): T {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback();
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(
    `Invalid ${name}=${JSON.stringify(raw)}. Expected one of: ${allowed.join(", ")}. ` +
      `See the "CA Field Reports" section of the README.`,
  );
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `See the "CA Field Reports" section of the README.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const caConfig = {
  get dataMode(): CaDataMode {
    return readEnum<CaDataMode>("CA_DATA_MODE", ["mock", "azure"], () => {
      if (process.env.NODE_ENV === "production") {
        // Fail closed: production must say which store it means.
        throw new Error(
          "Missing required environment variable CA_DATA_MODE. Set it to " +
            '"azure" (or "mock" for a demo deployment). See the "CA Field ' +
            'Reports" section of the README.',
        );
      }
      return "mock";
    });
  },

  /** Where New Project lists projects from. The CA application is the primary source. */
  get projectSource(): CaProjectSourceMode {
    return readEnum<CaProjectSourceMode>(
      "CA_PROJECT_SOURCE",
      ["mock", "vantagepoint", "ca-app", "none"],
      () => (this.dataMode === "mock" ? "mock" : "ca-app"),
    );
  },

  /** Used when the project source cannot be reached (VantagePoint by default in Azure). */
  get projectFallbackSource(): CaProjectFallbackMode {
    return readEnum<CaProjectFallbackMode>(
      "CA_PROJECT_FALLBACK_SOURCE",
      ["vantagepoint", "mock", "none"],
      () => (this.dataMode === "mock" ? "none" : "vantagepoint"),
    );
  },

  get drawingSource(): CaDrawingSourceMode {
    return readEnum<CaDrawingSourceMode>(
      "CA_DRAWING_SOURCE",
      ["mock", "ca-app", "none"],
      () => (this.dataMode === "mock" ? "mock" : "ca-app"),
    );
  },

  /**
   * How drawing-set sheets are named: by OpenAI from their title blocks, by a
   * deterministic MOCK reader (tests; nothing leaves the server), or not at
   * all (engineers name sheets by hand).
   */
  get sheetNaming(): CaSheetNamingMode {
    return readEnum<CaSheetNamingMode>("CA_SHEET_NAMING", ["openai", "mock", "none"], () =>
      process.env.OPENAI_API_KEY ? "openai" : "none",
    );
  },

  /**
   * Base URL of the CA application (parkhill-ccr backend), without `/api`,
   * e.g. the parkhill-contract-management-backend Web App's URL.
   */
  get caAppApiBaseUrl(): string {
    return required("CA_APP_API_BASE_URL").replace(/\/+$/, "");
  },

  /**
   * Entra scope for app-only calls to the CA application, e.g.
   * `api://<ccr app id>/.default`. The ccr backend must grant this app its
   * `FieldReports.Read` app role (docs/ca-integration-contracts.md §5).
   */
  get caAppApiScope(): string {
    return required("CA_APP_API_SCOPE");
  },

  /**
   * Accepting drawing-set pushes from the CA application
   * (`POST /api/ca/integrations/ccr/drawing-sets`, docs §5). ccr calls with
   * an app-only Entra token for this app's API, carrying the
   * `FieldReports.DrawingSync` app role. All three are needed; when any is
   * blank the endpoint answers 503 and drawing sets still sync on access.
   *
   * - `CA_SYNC_TENANT_ID`: the Entra tenant (issuer and signing keys).
   * - `CA_SYNC_API_AUDIENCE`: the token audience, i.e. this app's
   *   Application ID URI or client id.
   * - `CA_SYNC_ALLOWED_CLIENT_ID`: the caller's client id (the CA
   *   application's managed identity); any other caller is refused.
   */
  get caSyncTenantId(): string {
    return optional("CA_SYNC_TENANT_ID", "");
  },
  get caSyncApiAudience(): string {
    return optional("CA_SYNC_API_AUDIENCE", "");
  },
  get caSyncAllowedClientId(): string {
    return optional("CA_SYNC_ALLOWED_CLIENT_ID", "");
  },

  get cosmosProjectsContainer(): string {
    return optional("COSMOS_CA_PROJECTS_CONTAINER", "caProjects");
  },
  get cosmosReportsContainer(): string {
    return optional("COSMOS_CA_REPORTS_CONTAINER", "caReports");
  },
  get cosmosDrawingsContainer(): string {
    return optional("COSMOS_CA_DRAWINGS_CONTAINER", "caDrawings");
  },
  /** Photos and pins (the capture records). */
  get cosmosCaptureContainer(): string {
    return optional("COSMOS_CA_CAPTURE_CONTAINER", "caCapture");
  },
  get storageContainer(): string {
    return optional("AZURE_STORAGE_CA_CONTAINER", "ca-files");
  },

  /** Where mock mode keeps its data between dev-server restarts. Git-ignored. */
  get mockDataDir(): string {
    return optional("CA_MOCK_DATA_DIR", ".ca-dev-data");
  },
};
