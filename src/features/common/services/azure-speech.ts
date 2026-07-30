import "server-only";

import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import {
  AudioConfig,
  AutoDetectSourceLanguageConfig,
  ResultReason,
  SpeechConfig,
  SpeechRecognizer,
  SpeechSynthesisOutputFormat,
  SpeechSynthesizer,
} from "microsoft-cognitiveservices-speech-sdk";

/**
 * Azure AI Speech (STT + TTS) — server-side only, per
 * docs/Sales_Prism_SAD_v2.7.md decisions log line 1376: "Azure AI Speech
 * Service ... Implementeres som proxy via Next.js API route (audio ALDRIG
 * direkte til Azure fra browser). Web Speech API fravalgt — audio routes
 * til Google/Apple-servere (GDPR-brud)."
 *
 * SR-003 REMEDIATION (2026-07-30): a prior Phase F implementation issued a
 * Microsoft Entra ID-backed Speech authorization token to the browser
 * (`/api/speech/token`, now deleted) and opened a browser<->Azure WebSocket
 * directly from the seller's laptop via the client-side Speech SDK. That
 * contradicted the SAD-mandated proxy above. A prior escalation framed the
 * fix as an infra gap — "the Speech account needs `publicNetworkAccess:
 * Enabled`" — and that framing was WRONG; do not revisit it.
 * `infra/modules/speech.bicep`'s `publicNetworkAccess: 'Disabled'` is
 * CORRECT and stays exactly as-is: a customer's Private Endpoint is
 * deliberately unreachable from outside that customer's VNet, and an
 * external seller's browser was never supposed to be able to reach it —
 * that unreachability IS the control, not a bug to route around.
 *
 * The actual fix is entirely on the app side: every call into Azure Speech
 * now originates from THIS server module, which runs inside the
 * VNet-integrated App Service (`vnetRouteAllEnabled: true` — see
 * infra/modules/speech.bicep / the App Service network config), and which
 * therefore CAN reach the Private Endpoint. The browser only ever talks to
 * this app's own Route Handlers (`/api/speech/transcribe`,
 * `/api/speech/synthesize`) over plain same-origin HTTPS — it never holds
 * an Azure credential or a Speech Service token, and never opens a
 * WebSocket to `*.cognitiveservices.azure.com` / `*.speech.microsoft.com`
 * itself. See `transcribeAudio` / `synthesizeSpeech` below, and the client
 * callers in `chat-input/speech/audio-recorder.ts` (STT) and
 * `chat-input/speech/use-text-to-speech.ts` (TTS) — neither imports
 * `microsoft-cognitiveservices-speech-sdk` at all anymore.
 *
 * Zero-secrets (CLAUDE.md / SAD R3): `AZURE_SPEECH_KEY` (subscription key)
 * must NEVER be read here or anywhere else in this app —
 * `DefaultAzureCredential` (managed identity) only, same as `azure-ai.ts` /
 * `document-intelligence.ts`.
 *
 * Env var contract (all three set together by infra/modules/speech.bicep):
 *  - `AZURE_SPEECH_REGION` (required) — e.g. "westeurope".
 *  - `AZURE_SPEECH_RESOURCE_ID` (required) — the full ARM resource id of
 *    the Speech resource. Required to compose the Speech SDK's
 *    "aad#<resourceId>#<AAD token>" authorization-token format (see
 *    `buildServerSpeechConfig` below) — a bare AAD bearer token is not
 *    sufficient on its own for this SDK.
 *  - `AZURE_SPEECH_ENDPOINT` (required) — the Speech account's own
 *    custom-subdomain endpoint. `SpeechConfig.fromEndpoint(new
 *    URL(endpoint), "")` + `.authorizationToken = token` is the SDK's own
 *    documented pattern for combining a custom endpoint with token auth
 *    (the region-only `fromAuthorizationToken` constructor builds a
 *    generic `wss://{region}.stt.speech.microsoft.com` endpoint that does
 *    not resolve for a custom-subdomain account) — this is used as a
 *    fallback only, for backward compatibility with an older deployment
 *    that predates this env var.
 *
 * Until these env vars are set at all (Speech resource not yet provisioned
 * for a given customer), `isSpeechConfigured()` returns `false` and both
 * routes degrade to a 503 rather than erroring — see
 * `speech-availability-context.tsx`, which hides/disables the mic button
 * before either route is ever called.
 */

const SPEECH_AAD_SCOPE = "https://cognitiveservices.azure.com/.default";

/**
 * Sales Coach 360 languages (backlog F-02 §"Teknisk implementation"):
 * dansk, norsk, svensk, engelsk, tysk — this platform's actual Nordic B2B
 * customer languages. Same list previously used by the (now deleted)
 * client-side recognizer, now used server-side for auto language
 * detection.
 */
const SUPPORTED_SPEECH_LANGUAGES = ["da-DK", "nb-NO", "sv-SE", "en-US", "de-DE"];

/**
 * How long a single-utterance recognize/synthesize call may run before
 * this module gives up and surfaces an error — guards against a stalled
 * Azure Speech WebSocket ever hanging a Route Handler request
 * indefinitely.
 */
const SPEECH_CALL_TIMEOUT_MS = 20_000;

export const isSpeechConfigured = (): boolean =>
  Boolean(process.env.AZURE_SPEECH_REGION && process.env.AZURE_SPEECH_RESOURCE_ID);

let cachedTokenProvider: (() => Promise<string>) | undefined;

const getTokenProvider = (): (() => Promise<string>) => {
  if (cachedTokenProvider) return cachedTokenProvider;
  const credential = new DefaultAzureCredential();
  cachedTokenProvider = getBearerTokenProvider(credential, SPEECH_AAD_SCOPE);
  return cachedTokenProvider;
};

/**
 * Builds a server-side `SpeechConfig` authenticated via
 * `DefaultAzureCredential`. This value never leaves this process — no
 * Route Handler in this app ever serializes a `SpeechConfig`, an
 * authorization token, or any Azure credential back to the client (see the
 * module doc comment above).
 */
const buildServerSpeechConfig = async (): Promise<SpeechConfig> => {
  const resourceId = process.env.AZURE_SPEECH_RESOURCE_ID!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT || null;
  const tokenProvider = getTokenProvider();
  const aadToken = await tokenProvider();
  const authorizationToken = `aad#${resourceId}#${aadToken}`;

  if (endpoint) {
    const speechConfig = SpeechConfig.fromEndpoint(new URL(endpoint), "");
    speechConfig.authorizationToken = authorizationToken;
    return speechConfig;
  }

  return SpeechConfig.fromAuthorizationToken(authorizationToken, region);
};

const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), SPEECH_CALL_TIMEOUT_MS);
      // Never keep the Node process alive solely for this guard timer.
      if (typeof timer === "object" && "unref" in timer) (timer as NodeJS.Timeout).unref();
    }),
  ]);

export type TranscribeOutcome = { outcome: "recognized"; text: string } | { outcome: "no-match" };

/**
 * Maps a raw speech-recognition result to an app-level outcome. Extracted
 * as a standalone pure function — takes only primitives/the `ResultReason`
 * enum, not a live SDK recognizer/result object — so it is unit-testable
 * without opening a real WebSocket connection to Azure.
 */
export const mapRecognitionOutcome = (
  reason: ResultReason,
  text: string,
  errorDetails?: string
): TranscribeOutcome => {
  if (reason === ResultReason.RecognizedSpeech) {
    return { outcome: "recognized", text };
  }
  if (reason === ResultReason.NoMatch) {
    return { outcome: "no-match" };
  }
  throw new Error(errorDetails || `Unexpected speech recognition result: ${ResultReason[reason]}`);
};

/**
 * Transcribes a single pre-recorded utterance. `wavBuffer` MUST be a mono
 * uncompressed PCM WAV file (see `audio-validation.ts` /
 * `chat-input/speech/wav-encoder.ts`).
 *
 * `AudioConfig.fromWavFileInput(Buffer)` is the verified, Node-compatible
 * entry point for this SDK version — checked directly against the
 * installed `microsoft-cognitiveservices-speech-sdk@1.34.0` type
 * declarations (`distrib/lib/src/sdk/Audio/AudioConfig.d.ts`) and smoke
 * tested against a real Node `require()` of the package before this file
 * was written (see PR description). Compressed formats (webm/opus, mp4,
 * ...) are deliberately never sent here — decoding them server-side via
 * this SDK requires a GStreamer install that is not verified as available
 * on the Azure App Service Linux Node runtime; the browser already
 * decodes+re-encodes to WAV before upload (`audio-recorder.ts`), so this
 * server module never needs that dependency at all.
 */
export const transcribeAudio = async (wavBuffer: Buffer): Promise<TranscribeOutcome> => {
  const speechConfig = await buildServerSpeechConfig();
  const audioConfig = AudioConfig.fromWavFileInput(wavBuffer);
  const autoDetectSourceLanguageConfig =
    AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_SPEECH_LANGUAGES);
  const recognizer = SpeechRecognizer.FromConfig(
    speechConfig,
    autoDetectSourceLanguageConfig,
    audioConfig
  );

  try {
    const result = await withTimeout(
      new Promise<{ reason: ResultReason; text: string; errorDetails?: string }>(
        (resolve, reject) => {
          recognizer.recognizeOnceAsync(
            (r) => resolve({ reason: r.reason, text: r.text, errorDetails: r.errorDetails }),
            (err) => reject(new Error(err))
          );
        }
      ),
      "Speech recognition"
    );

    return mapRecognitionOutcome(result.reason, result.text, result.errorDetails);
  } finally {
    recognizer.close();
  }
};

/**
 * Synthesizes `text` to MP3 audio bytes, entirely server-side. Passing no
 * `AudioConfig` to `SpeechSynthesizer` (verified against
 * `distrib/lib/src/sdk/SpeechSynthesizer.d.ts` and
 * `SpeechSynthesisResult.d.ts`, and smoke tested with a real Node
 * `require()`) is the SDK's documented way to receive the synthesized
 * audio as an in-memory `ArrayBuffer` (`result.audioData`) instead of
 * attempting to play it to a system speaker device — which doesn't exist
 * on an App Service instance and would otherwise throw.
 */
export const synthesizeSpeech = async (text: string): Promise<Buffer> => {
  const speechConfig = await buildServerSpeechConfig();
  speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
  const synthesizer = new SpeechSynthesizer(speechConfig);

  try {
    const result = await withTimeout(
      new Promise<{ reason: ResultReason; audioData: ArrayBuffer; errorDetails?: string }>(
        (resolve, reject) => {
          synthesizer.speakTextAsync(
            text,
            (r) => resolve({ reason: r.reason, audioData: r.audioData, errorDetails: r.errorDetails }),
            (err) => reject(new Error(err))
          );
        }
      ),
      "Speech synthesis"
    );

    if (result.reason !== ResultReason.SynthesizingAudioCompleted) {
      throw new Error(result.errorDetails || "Speech synthesis did not complete.");
    }

    return Buffer.from(result.audioData);
  } finally {
    synthesizer.close();
  }
};
