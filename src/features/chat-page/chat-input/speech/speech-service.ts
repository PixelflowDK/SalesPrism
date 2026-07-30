import { SpeechConfig } from "microsoft-cognitiveservices-speech-sdk";

/**
 * Client-side wrapper around `GET /api/speech/token` (Stage 5c, backlog
 * F-02). Previously a Server Action that called Azure's STS
 * `issueToken` REST endpoint directly with `AZURE_SPEECH_KEY` (a
 * subscription key) — replaced per CLAUDE.md "No API keys anywhere":
 * the Route Handler now issues a Microsoft Entra ID-backed token via
 * `DefaultAzureCredential` (see azure-speech.ts), and this module never
 * touches a secret at all.
 *
 * `error: true` also covers the "not configured" (503) case — the Speech
 * resource doesn't exist in every environment yet; callers already show a
 * friendly message via `showError`, and the mic button itself is
 * hidden/disabled before this is ever called (see
 * `speech-availability-context.tsx`).
 */
export const GetSpeechToken = async () => {
  try {
    const response = await fetch("/api/speech/token", { cache: "no-store" });
    const body = (await response.json()) as {
      error: boolean;
      message?: string;
      token?: string;
      region?: string;
      endpoint?: string | null;
    };

    if (!response.ok || body.error) {
      return {
        error: true,
        errorMessage: body.message ?? "Voice input isn't available right now.",
        token: "",
        region: "",
        endpoint: null,
      };
    }

    return {
      error: false,
      errorMessage: "",
      token: body.token ?? "",
      region: body.region ?? "",
      endpoint: body.endpoint ?? null,
    };
  } catch {
    return {
      error: true,
      errorMessage: "Voice input isn't available right now.",
      token: "",
      region: "",
      endpoint: null,
    };
  }
};

/**
 * Builds a `SpeechConfig` from a successful `GetSpeechToken()` result.
 *
 * Prefers `SpeechConfig.fromEndpoint()` + `.authorizationToken` when
 * `AZURE_SPEECH_ENDPOINT` was set server-side (see azure-speech.ts doc
 * comment) — required for a Speech account provisioned with a custom
 * subdomain, since the region-only constructor below builds a generic
 * `wss://{region}.stt.speech.microsoft.com` endpoint that does not resolve
 * for such an account. Per the Speech JS SDK's own documented pattern for
 * combining a custom endpoint with token auth: pass an empty string as the
 * subscription key to `fromEndpoint`, then set `authorizationToken`
 * afterwards.
 *
 * Falls back to the region-only `fromAuthorizationToken` constructor when
 * `endpoint` is absent, for backward compatibility with any environment
 * that predates the `AZURE_SPEECH_ENDPOINT` env var.
 */
export const buildSpeechConfig = (tokenResult: {
  token: string;
  region: string;
  endpoint: string | null;
}): SpeechConfig => {
  if (tokenResult.endpoint) {
    const speechConfig = SpeechConfig.fromEndpoint(new URL(tokenResult.endpoint), "");
    speechConfig.authorizationToken = tokenResult.token;
    return speechConfig;
  }

  return SpeechConfig.fromAuthorizationToken(tokenResult.token, tokenResult.region);
};
