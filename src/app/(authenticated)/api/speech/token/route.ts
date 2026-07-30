import { getSpeechAuthToken } from "@/features/common/services/azure-speech";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

/**
 * Speech token issuance — SAD/backlog F-02. Server-side only: audio and
 * subscription-style secrets never touch the browser directly (CLAUDE.md
 * "No client-side Azure SDK calls" + "no API keys anywhere").
 *
 * Degrades gracefully (Stage 5c brief): the Speech Azure resource is not yet
 * provisioned in Bicep (separate infra workstream). When
 * `AZURE_SPEECH_REGION` / `AZURE_SPEECH_RESOURCE_ID` are absent, this
 * returns 503 with a stable, machine-checkable JSON body instead of a raw
 * 500 — the client (`speech-availability-context.tsx` /
 * `use-speech-to-text.ts`) uses this to hide/disable the mic with a tooltip
 * rather than surfacing an error to the seller mid-conversation.
 *
 * This route is excluded from the PWA service worker (next.config.js
 * `/api/speech` NetworkOnly rule) — a cached token would be reused past its
 * validity window.
 */
export async function GET(): Promise<Response> {
  const requestId = newRequestId();

  try {
    const speechToken = await getSpeechAuthToken();

    if (!speechToken) {
      return Response.json(
        {
          error: true,
          code: "speech_not_configured",
          message: "Voice input isn't available for this workspace yet.",
        },
        { status: 503 }
      );
    }

    return Response.json({
      error: false,
      token: speechToken.token,
      region: speechToken.region,
      endpoint: speechToken.endpoint,
      expiresInSeconds: speechToken.expiresInSeconds,
    });
  } catch {
    // Never log the raw credential/SDK error (same convention as
    // safe-logger.ts's chat.stream-error) — a DefaultAzureCredential
    // failure can carry environment/diagnostic detail.
    safeLog.error("speech.token-issuance-failed", { requestId });
    return Response.json(
      { error: true, code: "speech_token_error", message: "Unable to issue a speech token." },
      { status: 500 }
    );
  }
}
