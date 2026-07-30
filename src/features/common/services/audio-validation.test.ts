import { describe, expect, it } from "vitest";
import {
  isDeclaredContentLengthTooLarge,
  MAX_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_UPLOAD_BYTES,
  parseWavHeader,
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
