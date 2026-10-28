import "server-only";

/**
 * Server-side configuration.
 *
 * Every value here is a non-secret endpoint or resource name: the app
 * authenticates to Azure with a managed identity (`DefaultAzureCredential`),
 * so there are no keys or connection strings to configure or rotate.
 *
 * Read lazily and validated on first use so that a missing variable produces a
 * sentence naming the variable, rather than an Azure SDK stack trace three
 * layers down - and so that `next build` never needs Azure configuration.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in - see the "Azure setup" ` +
        `section of the README.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  get cosmosEndpoint() {
    return required("COSMOS_ENDPOINT");
  },
  get cosmosDatabase() {
    return optional("COSMOS_DATABASE", "parkhillcxfield");
  },
  get cosmosProjectsContainer() {
    return optional("COSMOS_PROJECTS_CONTAINER", "projects");
  },
  get cosmosObservationsContainer() {
    return optional("COSMOS_OBSERVATIONS_CONTAINER", "observations");
  },
  get storageAccount() {
    return required("AZURE_STORAGE_ACCOUNT");
  },
  get storageContainer() {
    return optional("AZURE_STORAGE_CONTAINER", "field-photos");
  },
  /** The one secret in the app. Server-only; never a `NEXT_PUBLIC_*` name. */
  get openaiApiKey() {
    return required("OPENAI_API_KEY");
  },
  /** Must be a vision-capable model: the cause suggestions read the photos. */
  get openaiModel() {
    return optional("OPENAI_MODEL", "gpt-5.5");
  },
};
