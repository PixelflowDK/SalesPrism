import { describe, expect, it } from "vitest";
import { parseWavHeader } from "@/features/common/services/audio-validation";
import { downsampleFloat32, encodeMonoPcmWav, floatTo16BitPCM } from "./wav-encoder";

describe("floatTo16BitPCM", () => {
  it("maps 0 to 0, and clamps out-of-range input to the int16 boundaries", () => {
    const pcm = floatTo16BitPCM(new Float32Array([0, 1, -1, 2, -2]));
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(0x7fff);
    expect(pcm[2]).toBe(-0x8000);
    expect(pcm[3]).toBe(0x7fff); // clamped from 2
    expect(pcm[4]).toBe(-0x8000); // clamped from -2
  });
});

describe("downsampleFloat32", () => {
  it("is a no-op when the output rate is >= the input rate", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(downsampleFloat32(input, 16000, 16000)).toBe(input);
    expect(downsampleFloat32(input, 16000, 44100)).toBe(input);
  });

  it("reduces sample count proportionally to the rate ratio", () => {
    const input = new Float32Array(48000).fill(0.5); // 1 second @ 48kHz
    const output = downsampleFloat32(input, 48000, 16000);
    expect(output.length).toBe(16000); // 1 second @ 16kHz
  });

  it("averages samples within each output bucket (box filter)", () => {
    // 2:1 downsample of [0, 1, 0, 1] should average each pair -> [0.5, 0.5]
    const input = new Float32Array([0, 1, 0, 1]);
    const output = downsampleFloat32(input, 2, 1);
    expect(Array.from(output)).toEqual([0.5, 0.5]);
  });
});

describe("encodeMonoPcmWav", () => {
  it("produces a buffer of exactly 44 (header) + 2 bytes per sample", () => {
    const samples = new Float32Array(16000).fill(0); // 1 second @ 16kHz
    const wav = encodeMonoPcmWav(samples, 16000);
    expect(wav.byteLength).toBe(44 + 16000 * 2);
  });

  it("round-trips through audio-validation.ts#parseWavHeader with matching sampleRate/duration", () => {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * 2).fill(0); // 2 seconds
    const wav = encodeMonoPcmWav(samples, sampleRate);
    const header = parseWavHeader(Buffer.from(wav));

    expect(header).not.toBeNull();
    expect(header?.sampleRate).toBe(sampleRate);
    expect(header?.numChannels).toBe(1);
    expect(header?.bitsPerSample).toBe(16);
    expect(header?.durationSeconds).toBeCloseTo(2, 2);
  });
});
