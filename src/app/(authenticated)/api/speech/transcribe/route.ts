import { userHashedId } from "@/features/auth-page/helpers";
import {
  isDeclaredContentLengthTooLarge,
  MAX_AUDIO_UPLOAD_BYTES,
  validateAudioUpload,
} from "@/features/common/services/audio-validation";
import { isSpeechConfigured, transcribeAudio } from "@/features/common/services/azure-speech";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

// Needs `Buffer` + the Speech SDK's Node websocket transport (`ws`) — never
// the edge runtime. Explicit even though `nodejs` is already this route's
// default, so a future framework default change can't silently break it.
export const runtime = "nodejs";

/**
 * STT transcription endpoint — SR-003 remediation (SAD decisions log line
 * 1376). Replaces the deleted `/api/speech/token` + client-side Speech SDK
 * WebSocket: the browser now records locally (see
 * `chat-input/speech/audio-recorder.ts`), uploads the finished WAV blob
 * here over plain HTTPS, and this route is the ONLY thing in the app that
 * talks to Azure Speech for STT — see `azure-speech.ts`'s module doc
 * comment for the full rationale.
 *
 * Session auth: `middleware.ts`'s `requireAuth` matcher already gates every
 * `/api/speech/:path*` request; `userHashedId()` re-checks explicitly here
 * too (defense in depth, same pattern as
 * `api/sales-coach/meeting-briefs/[id]/route.ts`) so this route is never
 * reachable un-authenticated even if the middleware matcher ever changes.
 *
 * Abuse surface: an unauthenticated-looking or oversized upload is
 * rejected as early as possible — `Content-Length` first (before reading
 * any body bytes), then the real `buffer.length` + WAV-duration check once
 * read (`audio-validation.ts` — a client can lie about/omit
 * `Content-Length`, so that header check is a fast-path only, never the
 * sole guard).
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();

  try {
    await userHashedId();
  } catch {
    return Response.json(
      { error: true, code: "unauthorized", message: "Sign in required." },
      { status: 401 }
    );
  }

  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader && isDeclaredContentLengthTooLarge(Number(contentLengthHeader))) {
    return Response.json(
      {
        error: true,
        code: "audio_too_large",
        message: `Recording exceeds the ${Math.floor(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024))}MB limit.`,
      },
      { status: 413 }
    );
  }

  if (!isSpeechConfigured()) {
    return Response.json(
      {
        error: true,
        code: "speech_not_configured",
        message: "Voice input isn't available for this workspace yet.",
      },
      { status: 503 }
    );
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return Response.json(
      { error: true, code: "invalid_body", message: "Unable to read the uploaded audio." },
      { status: 400 }
    );
  }

  const validation = validateAudioUpload(buffer);
  if (!validation.ok) {
    return Response.json(
      { error: true, code: validation.code, message: validation.message },
      { status: validation.status }
    );
  }

  try {
    const result = await transcribeAudio(buffer);
    if (result.outcome === "no-match") {
      return Response.json({ error: false, text: "", noSpeechDetected: true });
    }
    return Response.json({ error: false, text: result.text });
  } catch {
    // Never log the raw SDK error — same convention as safe-logger.ts's
    // other call sites — a Speech SDK cancellation error can carry
    // diagnostic detail (endpoint, connection id) that shouldn't land in
    // Application Insights.
    safeLog.error("speech.transcribe-failed", { requestId });
    return Response.json(
      { error: true, code: "speech_transcribe_error", message: "Unable to transcribe audio." },
      { status: 500 }
    );
  }
}
