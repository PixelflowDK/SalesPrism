import { userHashedId } from "@/features/auth-page/helpers";
import { cleanupSttTranscript } from "@/features/sales-coach/stt-cleanup";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

/**
 * CR2-4 (MEDIUM) remediation — this app-level guard exists ONLY to bound
 * `generateObject`'s (Azure OpenAI) token cost per call; it is not a
 * transcript-length product limit. A raw STT transcript this size would
 * already be many times longer than `MAX_AUDIO_DURATION_SECONDS` (2
 * minutes of speech) could ever produce, so it never fires for a
 * legitimate dictation — only for a caller POSTing arbitrary bulk text
 * directly to this route.
 */
const MAX_RAW_TEXT_CHARACTERS = 8000;

/**
 * STT post-processing endpoint — backlog F-02. One call, kept fast (single
 * `generateObject` round-trip, see stt-cleanup.ts). Always returns 200 with
 * usable text: a cleanup failure falls back to the raw transcript rather
 * than erroring, so the seller is never blocked by this best-effort step.
 *
 * Excluded from the PWA service worker (next.config.js `/api/speech`
 * NetworkOnly rule) — this is a one-shot POST, never meant to be replayed
 * from cache.
 *
 * CR2-4 (MEDIUM) remediation: previously relied solely on
 * `middleware.ts`'s `requireAuth` matcher for authentication and had no
 * cap on `rawText` before forwarding it to `generateObject` — a signed-in
 * user could turn this into an unbounded Azure OpenAI token sink, and if
 * the middleware matcher ever regressed this route would be anonymously
 * reachable. Same defense-in-depth pattern as `transcribe/route.ts` /
 * `synthesize/route.ts`: `userHashedId()` re-checks the session in-handler,
 * and `MAX_RAW_TEXT_CHARACTERS` bounds the model call regardless of who's
 * calling.
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

  let rawText: string;
  try {
    const body = (await req.json()) as { rawText?: unknown };
    if (typeof body.rawText !== "string" || body.rawText.trim().length === 0) {
      return Response.json(
        { error: true, code: "missing_raw_text", message: "rawText is required." },
        { status: 400 }
      );
    }
    if (body.rawText.length > MAX_RAW_TEXT_CHARACTERS) {
      return Response.json(
        {
          error: true,
          code: "raw_text_too_large",
          message: `rawText exceeds the ${MAX_RAW_TEXT_CHARACTERS}-character limit.`,
        },
        { status: 413 }
      );
    }
    rawText = body.rawText;
  } catch {
    return Response.json(
      { error: true, code: "invalid_body", message: "Expected a JSON body with rawText." },
      { status: 400 }
    );
  }

  try {
    const result = await cleanupSttTranscript(rawText);
    return Response.json({ error: false, ...result });
  } catch {
    // cleanupSttTranscript already falls back internally on model failure —
    // this only guards against something unexpected (e.g. a serialization
    // bug), and still degrades to the raw transcript rather than a hard error.
    safeLog.error("speech.cleanup-route-failed", { requestId });
    return Response.json({ error: false, category: "free-chat", cleanedText: rawText });
  }
}
