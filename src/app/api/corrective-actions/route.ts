import { apiError, handleRoute } from "@/lib/apiResponse";
import { newItemId } from "@/lib/ids";
import { readSuggestionRequest } from "@/lib/suggestionRequest";
import { buildMockActions } from "@/mocks/correctiveActions";
import type { SelectableItem } from "@/types";

/**
 * Step 3 suggestions.
 *
 * ============================================================================
 * THIS IS THE SECOND OF THE TWO POINTS WHERE AI GETS CONNECTED.
 *
 * Today it returns placeholder data from `src/mocks/correctiveActions.ts`.
 * Replace the `buildMockActions(...)` call below with a server-side model
 * request, reading credentials from `process.env` only.
 *
 * Note that the request carries `selectedCauses` - the causes the engineer
 * actually accepted on Step 2. A real prompt should be built from those rather
 * than from the raw observation alone, so the suggested actions follow the
 * engineer's judgement instead of second-guessing it.
 * ============================================================================
 */

const MOCK_LATENCY_MS = 700;

export async function POST(request: Request) {
  return handleRoute("generate suggested corrective actions", async () => {
    const body: unknown = await request.json().catch(() => null);
    const suggestionRequest = readSuggestionRequest(body);

    if (!suggestionRequest) {
      return apiError(
        "Equipment and the field observation are both required.",
        400,
      );
    }
    if (
      !suggestionRequest.selectedCauses ||
      suggestionRequest.selectedCauses.length === 0
    ) {
      return apiError("Select at least one potential failure cause first.", 400);
    }

    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

    const actions: SelectableItem[] = buildMockActions(suggestionRequest).map(
      (text) => ({
        id: newItemId(),
        text,
        selected: false,
        isCustom: false,
      }),
    );

    return Response.json({ actions });
  });
}
