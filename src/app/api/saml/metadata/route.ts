import { serviceProviderMetadata } from "@/lib/auth/samlClient";

/**
 * Service provider metadata.
 *
 * Parkhill IT can point the Entra enterprise application at this URL (or
 * upload the file) instead of transcribing the identifier and reply URL by
 * hand - the step in SAML setup that most often gets typed wrong and produces
 * an opaque "AADSTS700016" style failure hours later.
 */
export async function GET() {
  try {
    return new Response(serviceProviderMetadata(), {
      headers: {
        "Content-Type": "application/samlmetadata+xml; charset=utf-8",
        "Content-Disposition": 'inline; filename="parkhillcxfield-sp.xml"',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Metadata could not be generated.";
    console.error("[ParkhillCXField] SP metadata generation failed", error);
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
