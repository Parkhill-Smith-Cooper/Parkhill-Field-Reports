import { cookies } from "next/headers";

import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";
import { azureCredential } from "@/lib/azure/credential";

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * The signed-in engineer's Entra profile photo, for the avatar in the header.
 *
 * parkhill-ccr gets this with the user's own token (on-behalf-of `/me/photo`).
 * Sign-in here is SAML, so there is no user token for Graph; the app reads the
 * photo under its own identity instead. In Azure that is the managed identity,
 * which needs the `ProfilePhoto.Read.All` Graph *application* permission
 * (assigned with Graph PowerShell / CLI - managed identities have no API
 * permissions blade). Locally it is `az login`, which can read your own photo.
 *
 * Answers with the image itself, so it can be an `<img src>`. Any failure is a
 * 204: a missing photo must never break the header, it just shows the icon.
 */
export async function GET() {
  const store = await cookies();
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return new Response(null, { status: 204 });

  try {
    const { token } = await azureCredential().getToken(
      "https://graph.microsoft.com/.default",
    );
    const user = encodeURIComponent(session.sub);

    // The thumbnail first: the header shows a 32px circle, and the full photo
    // is several times the size. Not every account has every size, so fall
    // back to the default before concluding there is no photo.
    for (const path of [`photos/96x96/$value`, `photo/$value`]) {
      const response = await fetch(`${GRAPH}/users/${user}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (response.ok) {
        return new Response(response.body, {
          headers: {
            "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
            // The header is on every page; a photo rarely changes.
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      if (response.status === 401 || response.status === 403) {
        console.warn(
          "[ParkhillCXField] Graph denied the profile photo request. The " +
            "app identity likely needs ProfilePhoto.Read.All.",
        );
        break;
      }
    }
  } catch (error) {
    console.warn("[ParkhillCXField] Could not load the profile photo", error);
  }

  return new Response(null, {
    status: 204,
    // Short, so a photo added later or a fixed permission shows up soon.
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
