import { userHashedId } from "@/features/auth-page/helpers";
import { isSpeechConfigured, synthesizeSpeech } from "@/features/common/services/azure-speech";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

export const runtime = "nodejs"; // needs the Speech SDK's Node websocket transport — never edge

/**
 * TTS synthesis endpoint — SR-003 remediation follow-through. The (now
 * deleted) `/api/speech/token` route was shared by both STT and TTS: the
 * client-side Speech SDK used it to open a browser<->Azure WebSocket for
 * *both* directions (mic audio up, synthesized audio down). Deleting that
 * shared token path to fix STT would otherwise have left TTS silently
 * broken, so playback is proxied the same way: this route calls Azure
 * Speech server-side and returns finished MP3 bytes; the client
 * (`use-text-to-speech.ts`) just plays them via a plain `<audio>` element —
 * no Azure SDK import, no token, no direct connection from the browser.
 *
 * Auth: same defense-in-depth as `transcribe/route.ts` — `middleware.ts`
 * already gates `/api/speech/:path*`, `userHashedId()` re-checks here too.
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

  if (!isSpeechConfigured()) {
    return Response.json(
      {
        error: true,
        code: "speech_not_configured",
        message: "Voice output isn't available for this workspace yet.",
      },
      { status: 503 }
    );
  }

  // App-level abuse guard, not an Azure Speech service limit — TTS is only
  // ever invoked here on a single assistant chat message, never arbitrary
  // user-supplied bulk text.
  const MAX_TTS_CHARACTERS = 4000;

  let text: string;
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return Response.json(
        { error: true, code: "missing_text", message: "text is required." },
        { status: 400 }
      );
    }
    text = body.text.slice(0, MAX_TTS_CHARACTERS);
  } catch {
    return Response.json(
      { error: true, code: "invalid_body", message: "Expected a JSON body with text." },
      { status: 400 }
    );
  }

  try {
    const audio = await synthesizeSpeech(text);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    safeLog.error("speech.synthesize-failed", { requestId });
    return Response.json(
      { error: true, code: "speech_synthesize_error", message: "Unable to synthesize speech." },
      { status: 500 }
    );
  }
}
