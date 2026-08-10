import { afterEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` so these mock fns exist before the `vi.mock` factories below
// run (which are themselves hoisted above the imports by Vitest).
const currentUserIdMock = vi.hoisted(() => vi.fn());
const isSpeechConfiguredMock = vi.hoisted(() => vi.fn());
const transcribeAudioMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth-page/helpers", () => ({
  currentUserId: currentUserIdMock,
}));

vi.mock("@/features/common/services/azure-speech", () => ({
  isSpeechConfigured: isSpeechConfiguredMock,
  transcribeAudio: transcribeAudioMock,
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  newRequestId: () => "test-request-id",
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Deliberately NOT mocked — `audio-validation.ts` (incl. `readCappedBody`,
// the CR2-1 fix under test) runs for real here so this is an actual
// integration check of the route's abuse-path behavior, not just a
// re-assertion of the already-unit-tested helper.
import { MAX_AUDIO_UPLOAD_BYTES } from "@/features/common/services/audio-validation";
import { POST } from "./route";

/**
 * A `ReadableStream` that never closes on its own and hands back
 * `chunkSize` bytes every time it's pulled — simulates an attacker
 * streaming an effectively unbounded body while lying about (omitting)
 * `Content-Length`. Tracks how many chunks were actually produced and
 * whether the stream was cancelled, so the test can assert the route
 * stopped reading early rather than only checking the final HTTP status.
 */
const makeUnboundedStream = (chunkSize: number) => {
  let pullCount = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(new Uint8Array(chunkSize).fill(9));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, getPullCount: () => pullCount, wasCancelled: () => cancelled };
};

describe("POST /api/speech/transcribe — CR2-1 oversized-body DoS guard", () => {
  afterEach(() => {
    currentUserIdMock.mockReset();
    isSpeechConfiguredMock.mockReset();
    transcribeAudioMock.mockReset();
  });

  it("rejects an oversized, Content-Length-less streamed upload with 413 without ever fully buffering it or calling Azure Speech", async () => {
    currentUserIdMock.mockResolvedValue("hashed-user-id");
    isSpeechConfiguredMock.mockReturnValue(true);

    const chunkSize = 64 * 1024; // 64KB per chunk
    const probe = makeUnboundedStream(chunkSize);

    // No `content-length` header at all — the attack this fix closes is
    // exactly "lie about/omit Content-Length and stream a huge body".
    const req = new Request("http://localhost/api/speech/transcribe", {
      method: "POST",
      body: probe.stream,
      duplex: "half",
    } as RequestInit);

    const response = await POST(req);

    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.code).toBe("audio_too_large");

    // The abort-path assertions: the route must have stopped reading the
    // stream almost immediately (a small, bounded number of chunks — never
    // anywhere close to what an unbounded attacker stream would produce if
    // fully drained) and explicitly cancelled it, and it must never have
    // reached the expensive Azure Speech call.
    const maxPossibleChunks = Math.ceil(MAX_AUDIO_UPLOAD_BYTES / chunkSize) + 2;
    expect(probe.getPullCount()).toBeLessThanOrEqual(maxPossibleChunks);
    expect(probe.wasCancelled()).toBe(true);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("still returns 401 before ever touching the body when unauthenticated", async () => {
    currentUserIdMock.mockRejectedValue(new Error("no session"));
    isSpeechConfiguredMock.mockReturnValue(true);

    const probe = makeUnboundedStream(1024);
    const req = new Request("http://localhost/api/speech/transcribe", {
      method: "POST",
      body: probe.stream,
      duplex: "half",
    } as RequestInit);

    const response = await POST(req);

    expect(response.status).toBe(401);
    // The route's own `readCappedBody` call must never run for an
    // unauthenticated request — Node's `Request` constructor itself may
    // eagerly pull a single initial chunk while normalizing a streamed
    // body (an undici implementation detail, unrelated to application
    // code), so this asserts "at most the constructor's own priming read",
    // not "the stream was never touched at all".
    expect(probe.getPullCount()).toBeLessThanOrEqual(1);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });
});
