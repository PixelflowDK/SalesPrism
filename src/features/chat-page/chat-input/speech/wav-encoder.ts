/**
 * Pure PCM/WAV helpers — no browser (`window`/`AudioContext`) or Node
 * (`Buffer`) specific APIs, so this module works identically from the
 * browser recorder (`audio-recorder.ts`) and from unit tests (vitest, node
 * environment) with zero DOM mocking.
 *
 * SR-003 (docs/Sales_Prism_SAD_v2.7.md decisions log line 1376): recording
 * -> WAV encoding happens entirely client-side so the *server* never needs
 * to decode a compressed codec (webm/opus, mp4/aac, ...) — see
 * `audio-speech.ts`'s `transcribeAudio` doc comment for why that matters
 * (GStreamer availability on Azure App Service Linux is not verified).
 */

/** Azure Speech's documented default/optimal STT input sample rate. */
export const TARGET_SAMPLE_RATE = 16000;

/**
 * Downsamples mono Float32 PCM samples using simple box-filter averaging.
 * A no-op (returns `input` unchanged) when `outputSampleRate >=
 * inputSampleRate` — this module never upsamples, and callers should never
 * need it to (browser mic input is always >= 16kHz in practice).
 */
export const downsampleFloat32 = (
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number = TARGET_SAMPLE_RATE
): Float32Array => {
  if (outputSampleRate >= inputSampleRate || input.length === 0) {
    return input;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    output[i] = count > 0 ? sum / count : 0;
  }

  return output;
};

/** Converts [-1, 1] float samples to signed 16-bit PCM, clamping out-of-range input. */
export const floatTo16BitPCM = (input: Float32Array): Int16Array => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
};

/**
 * Encodes mono Float32 PCM samples as a standard 16-bit PCM RIFF/WAVE
 * file — the exact uncompressed format
 * `AudioConfig.fromWavFileInput(Buffer)` expects server-side (verified
 * against the installed `microsoft-cognitiveservices-speech-sdk@1.34.0`
 * type declarations — see `azure-speech.ts`), and the same layout
 * `audio-validation.ts#parseWavHeader` parses on the way in.
 */
export const encodeMonoPcmWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const pcm = floatTo16BitPCM(samples);
  const dataSize = pcm.length * 2; // 16-bit = 2 bytes/sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audioFormat = PCM
  view.setUint16(22, 1, true); // numChannels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = sampleRate * channels * bytesPerSample
  view.setUint16(32, 2, true); // block align = channels * bytesPerSample
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true);
  }

  return buffer;
};
