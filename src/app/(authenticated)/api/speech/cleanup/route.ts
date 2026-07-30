import { cleanupSttTranscript } from "@/features/sales-coach/stt-cleanup";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";

/**
 * STT post-processing endpoint — backlog F-02. One call, kept fast (single
 * `generateObject` round-trip, see stt-cleanup.ts). Always returns 200 with
 * usable text: a cleanup failure falls back to the raw transcript rather
 * than erroring, so the seller is never blocked by this best-effort step.
 *
 * Excluded from the PWA service worker (next.config.js `/api/speech`
 * NetworkOnly rule) — this is a one-shot POST, never meant to be replayed
 * from cache.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = newRequestId();

  let rawText: string;
  try {
    const body = (await req.json()) as { rawText?: unknown };
    if (typeof body.rawText !== "string" || body.rawText.trim().length === 0) {
      return Response.json(
        { error: true, code: "missing_raw_text", message: "rawText is required." },
        { status: 400 }
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
