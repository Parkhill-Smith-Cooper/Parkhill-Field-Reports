import { apiError, handleRoute } from "@/lib/apiResponse";
import { newItemId } from "@/lib/ids";
import { readSuggestionRequest } from "@/lib/suggestionRequest";
import { buildMockCauses } from "@/mocks/failureCauses";
import type { SelectableItem } from "@/types";

/**
 * Step 2 suggestions.
 *
 * ============================================================================
 * THIS IS ONE OF THE TWO POINTS WHERE AI GETS CONNECTED.
 *
 * Today it returns placeholder data from `src/mocks/failureCauses.ts`.
 * To connect a real model, replace the `buildMockCauses(...)` call below with a
 * server-side request that reads its key from `process.env` - for example
 * `process.env.OPENAI_API_KEY`, set as an Azure App Service application
 * setting.
 *
 * Nothing above this file changes. The browser calls this route, never a model
 * provider directly, so no credential ever reaches client code. Keep it that
 * way: never import an AI SDK into a component, and never expose a key through
 * a `NEXT_PUBLIC_*` variable.
 * ============================================================================
 */

/** Enough delay that the loading state is genuinely visible while testing the
 *  workflow. A real model call will take at least this long. */
const MOCK_LATENCY_MS = 700;

export async function POST(request: Request) {
  return handleRoute("generate potential failure causes", async () => {
    const body: unknown = await request.json().catch(() => null);
    const suggestionRequest = readSuggestionRequest(body);

    if (!suggestionRequest) {
      return apiError(
        "Equipment and the field observation are both required.",
        400,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

    const causes: SelectableItem[] = buildMockCauses(suggestionRequest).map(
      (text) => ({
        id: newItemId(),
        text,
        // Nothing is pre-selected: the engineer stays in control of every
        // item that reaches the report.
        selected: false,
        isCustom: false,
      }),
    );

    return Response.json({ causes });
  });
}
