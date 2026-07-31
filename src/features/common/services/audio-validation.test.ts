import { describe, expect, it } from "vitest";
import {
  isDeclaredContentLengthTooLarge,
  MAX_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_UPLOAD_BYTES,
  parseWavHeader,
  readCappedBody,
  validateAudioUpload,
} from "./audio-validation";

/**
 * Builds a minimal, well-formed mono PCM WAV buffer with `durationSeconds`
 * worth of silent audio at `sampleRate` — enough for
 * `parseWavHeader`/`validateAudioUpload` to exercise real chunk-walking
 * logic without depending on the browser-side encoder in
 * `chat-input/speech/wav-encoder.ts` (kept dependency-free on purpose, see
 * that module's own tests for the actual encoder round-trip).
 */
const buildWavBuffer = (
  durationSeconds: number,
  sampleRate = 16000,
  bitsPerSample = 16,
  numChannels = 1
): Buffer => {
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = Math.round(durationSeconds * sampleRate * numChannels * bytesPerSample);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
};

describe("parseWavHeader", () => {
  it("parses a well-formed mono 16kHz/16-bit PCM WAV header", () => {
    const buffer = buildWavBuffer(1);
    const header = parseWavHeader(buffer);

    expect(header).not.toBeNull();
    expect(header?.sampleRate).toBe(16000);
    expect(header?.numChannels).toBe(1);
    expect(header?.bitsPerSample).toBe(16);
    expect(header?.durationSeconds).toBeCloseTo(1, 2);
  });

  it("returns null for a buffer that isn't RIFF/WAVE at all", () => {
    expect(parseWavHeader(Buffer.from("not-a-wav-file-at-all"))).toBeNull();
  });

  it("returns null for a truncated header (too short to contain a data chunk)", () => {
    const truncated = buildWavBuffer(1).subarray(0, 30);
    expect(parseWavHeader(Buffer.from(truncated))).toBeNull();
  });

  it("returns null when the fmt chunk declares a non-PCM audioFormat (e.g. a compressed codec)", () => {
    const buffer = buildWavBuffer(1);
    buffer.writeUInt16LE(7, 20); // AudioFormatTag.WEBM_OPUS-ish, not PCM(1)
    expect(parseWavHeader(buffer)).toBeNull();
  });

  it("clamps a data chunk size larger than what's actually present in the buffer", () => {
    const buffer = buildWavBuffer(1);
    buffer.writeUInt32LE(0xffffffff, 40); // streaming/placeholder size some encoders write
    const header = parseWavHeader(buffer);
    expect(header).not.toBeNull();
    expect(header!.dataSize).toBe(buffer.length - 44);
  });
});

describe("validateAudioUpload", () => {
  it("accepts a short, well-formed recording", () => {
    const result = validateAudioUpload(buildWavBuffer(2));
    expect(result.ok).toBe(true);
  });

  it("rejects an empty buffer as 400 audio_empty", () => {
    const result = validateAudioUpload(Buffer.alloc(0));
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "audio_empty",
      message: "No audio was received.",
    });
  });

  it("rejects a non-WAV buffer as 400 audio_invalid_format", () => {
    const result = validateAudioUpload(Buffer.from("definitely not audio"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.code).toBe("audio_invalid_format");
    }
  });

  it("rejects an oversized buffer as 413 audio_too_large, before even parsing it", () => {
    const oversized = Buffer.alloc(MAX_AUDIO_UPLOAD_BYTES + 1);
    const result = validateAudioUpload(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.code).toBe("audio_too_large");
    }
  });

  it("rejects a WAV recording longer than MAX_AUDIO_DURATION_SECONDS as 413 audio_too_long", () => {
    const tooLong = buildWavBuffer(MAX_AUDIO_DURATION_SECONDS + 5);
    const result = validateAudioUpload(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.code).toBe("audio_too_long");
    }
  });

  it("accepts a recording right at the duration boundary", () => {
    const atBoundary = buildWavBuffer(MAX_AUDIO_DURATION_SECONDS);
    const result = validateAudioUpload(atBoundary);
    expect(result.ok).toBe(true);
  });
});

describe("isDeclaredContentLengthTooLarge", () => {
  it("is false for a declared length under the cap", () => {
    expect(isDeclaredContentLengthTooLarge(1024)).toBe(false);
  });

  it("is true for a declared length over the cap", () => {
    expect(isDeclaredContentLengthTooLarge(MAX_AUDIO_UPLOAD_BYTES + 1)).toBe(true);
  });

  it("is false for a non-finite/garbage value (fail open on the header, real check happens on the real buffer)", () => {
    expect(isDeclaredContentLengthTooLarge(Number.NaN)).toBe(false);
  });
});

describe("readCappedBody — CR2-1 (streamed oversized-upload DoS) remediation", () => {
  /**
   * A `ReadableStream` that never closes on its own — every `pull()` hands
   * back another `chunkSize`-byte chunk, simulating an attacker streaming
   * an effectively unbounded body. The only way this ever stops producing
   * chunks is if the consumer cancels it, which is exactly what
   * `readCappedBody` must do once the running total crosses `maxBytes`.
   */
  const makeUnboundedStream = (chunkSize: number) => {
    let pullCount = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array(chunkSize).fill(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    return { stream, getPullCount: () => pullCount, wasCancelled: () => cancelled };
  };

  it("returns the full buffer for a small body well under the cap", async () => {
    const chunkSize = 100;
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        controller.enqueue(new Uint8Array(chunkSize).fill(7));
      },
    });

    const result = await readCappedBody(stream, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buffer.length).toBe(chunkSize);
    }
  });

  it("treats a null body as an empty, ok buffer", async () => {
    const result = await readCappedBody(null, MAX_AUDIO_UPLOAD_BYTES);
    expect(result).toEqual({ ok: true, buffer: Buffer.alloc(0) });
  });

  it("aborts as soon as the running total exceeds the cap, never draining the rest of an unbounded body", async () => {
    const chunkSize = 1000; // 1KB per chunk
    const maxBytes = 5000; // 5KB cap
    const probe = makeUnboundedStream(chunkSize);

    const result = await readCappedBody(probe.stream, maxBytes);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.code).toBe("audio_too_large");
      // Bytes actually pulled before abort are close to the cap, not the
      // effectively-infinite total this probe stream would produce if
      // `readCappedBody` kept calling read() — this is the load-bearing
      // assertion that the oversized body was never fully buffered.
      expect(result.bytesReadBeforeAbort).toBeGreaterThan(maxBytes);
      expect(result.bytesReadBeforeAbort).toBeLessThan(maxBytes + chunkSize * 2);
    }

    // A handful of chunks only — nowhere close to what draining the whole
    // (unbounded) stream would require — and the stream was explicitly
    // cancelled so the producer stops sending more bytes at all.
    expect(probe.getPullCount()).toBeLessThanOrEqual(Math.ceil(maxBytes / chunkSize) + 1);
    expect(probe.wasCancelled()).toBe(true);
  });

  it("rejects a body whose size lands exactly one byte over the cap", async () => {
    const maxBytes = 10;
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        controller.enqueue(new Uint8Array(maxBytes + 1).fill(0));
      },
    });

    const result = await readCappedBody(stream, maxBytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bytesReadBeforeAbort).toBe(maxBytes + 1);
    }
  });

  it("accepts a body whose size lands exactly at the cap", async () => {
    const maxBytes = 10;
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        controller.enqueue(new Uint8Array(maxBytes).fill(0));
      },
    });

    const result = await readCappedBody(stream, maxBytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buffer.length).toBe(maxBytes);
    }
  });
});
