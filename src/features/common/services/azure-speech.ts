import "server-only";

import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

/**
 * Azure AI Speech (STT) — server-side-only token issuance, SAD/backlog F-02.
 *
 * Zero-secrets (CLAUDE.md / SAD R3): `AZURE_SPEECH_KEY` (subscription key)
 * must NEVER be read here or anywhere else in this app — DefaultAzureCredential
 * (managed identity) only, same as `azure-ai.ts` / `document-intelligence.ts`.
 *
 * Env var contract (all three set together by infra/modules/speech.bicep,
 * committed 2026-07-30 — see that module for the resource definition):
 *  - `AZURE_SPEECH_REGION` (required) — e.g. "westeurope". Kept for display/
 *    diagnostics and as the input to `SpeechConfig.fromAuthorizationToken`'s
 *    region-only fallback path (see client callers) if `AZURE_SPEECH_ENDPOINT`
 *    is ever absent on an older deployment.
 *  - `AZURE_SPEECH_RESOURCE_ID` (required) — the full ARM resource id of the
 *    Speech resource, e.g.
 *    `/subscriptions/{sub}/resourceGroups/rg-azurechat-{slug}/providers/Microsoft.CognitiveServices/accounts/speech-azurechat-{slug}`.
 *    Required to compose the Microsoft Entra ID ("aad#") authorization token
 *    format the Speech SDK expects (see `buildSpeechAuthToken` below) — a
 *    bare AAD bearer token is NOT sufficient on its own for this SDK.
 *  - `AZURE_SPEECH_ENDPOINT` (required) — the Speech account's own endpoint
 *    (`speechAccount.properties.endpoint` in Bicep), reflecting the
 *    `customSubDomainName` set on the resource. The Speech JS SDK's
 *    region-only constructors (`SpeechConfig.fromAuthorizationToken(token,
 *    region)`) build a *generic* `wss://{region}.stt.speech.microsoft.com`
 *    endpoint that does not resolve for a custom-subdomain account — client
 *    callers MUST prefer `SpeechConfig.fromEndpoint(new URL(endpoint), "")`
 *    + `.authorizationToken = token` instead (the SDK's own documented
 *    pattern for combining a custom endpoint with token auth), falling back
 *    to the region-only constructor only if this env var is unset.
 *
 * KNOWN GOTCHA — flag for Kristjan / azure-infra-engineer, not fixed here
 * (infra/ is out of this file's ownership): `infra/modules/speech.bicep`
 * currently sets `publicNetworkAccess: 'Disabled'` on the Speech account.
 * STT in this app is a *browser-side* real-time SDK connection (the
 * seller's own laptop talks directly to Azure over a WebSocket — the
 * Node-side of this app only issues the auth token, see
 * `getSpeechAuthToken` below). A customer's Private Endpoint is only
 * reachable from within that customer's VNet; an external seller's browser
 * is not on the VNet and therefore CANNOT reach a `publicNetworkAccess:
 * Disabled` Speech account no matter what endpoint/token it is given. This
 * is an infra/architecture decision, not an app-code bug — resolving it
 * needs either (a) enabling public network access on the Speech account
 * (with compensating controls), or (b) building a server-side audio relay
 * through the VNet-integrated App Service. Until resolved, STT should be
 * assumed non-functional in any environment where the Speech resource is
 * actually deployed with today's Bicep.
 *
 * Until these env vars are set at all (Speech resource not yet provisioned
 * for a given customer), `isSpeechConfigured()` returns `false` and every
 * caller (the token route, the UI mic button) degrades gracefully rather
 * than erroring — see `src/app/(authenticated)/api/speech/token/route.ts`
 * and `src/features/chat-page/chat-input/speech/speech-availability-context.tsx`.
 */
const SPEECH_AAD_SCOPE = "https://cognitiveservices.azure.com/.default";

export const isSpeechConfigured = (): boolean =>
  Boolean(process.env.AZURE_SPEECH_REGION && process.env.AZURE_SPEECH_RESOURCE_ID);

export type SpeechAuthToken = {
  /** Speech SDK "aad#<resourceId>#<AAD token>" authorization-token format. */
  token: string;
  region: string;
  /**
   * `AZURE_SPEECH_ENDPOINT`, when set — the custom-subdomain endpoint
   * clients should prefer via `SpeechConfig.fromEndpoint()` (see module
   * doc comment). `null` when unset, in which case callers fall back to
   * the region-only `SpeechConfig.fromAuthorizationToken()` constructor.
   */
  endpoint: string | null;
  /**
   * Conservative client-side refresh hint. Microsoft Entra ID access tokens
   * for this scope are normally valid ~60-75 minutes; recommend refreshing
   * well before that so a long recording session never straddles expiry.
   */
  expiresInSeconds: number;
};

let cachedTokenProvider: (() => Promise<string>) | undefined;

const getTokenProvider = (): (() => Promise<string>) => {
  if (cachedTokenProvider) return cachedTokenProvider;
  const credential = new DefaultAzureCredential();
  cachedTokenProvider = getBearerTokenProvider(credential, SPEECH_AAD_SCOPE);
  return cachedTokenProvider;
};

/**
 * Issues a short-lived, Microsoft Entra ID-backed Speech authorization token.
 * Returns `null` when the Speech resource isn't configured yet — callers
 * MUST treat that as "feature unavailable", never as an error to surface
 * raw to the end user (see route handler for the 503 contract).
 */
export const getSpeechAuthToken = async (): Promise<SpeechAuthToken | null> => {
  if (!isSpeechConfigured()) return null;

  const resourceId = process.env.AZURE_SPEECH_RESOURCE_ID!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT || null;
  const tokenProvider = getTokenProvider();
  const aadToken = await tokenProvider();

  return {
    token: `aad#${resourceId}#${aadToken}`,
    region,
    endpoint,
    expiresInSeconds: 9 * 60, // conservative — matches the old STS-token lifetime this replaces
  };
};
