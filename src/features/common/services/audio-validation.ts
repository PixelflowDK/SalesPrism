/**
 * Pure validation for STT audio uploads (SR-003 remediation,
 * docs/Sales_Prism_SAD_v2.7.md decisions log line 1376). No Azure/network
 * dependency — this is the "abuse surface" guard the
 * `/api/speech/transcribe` route runs BEFORE ever calling Azure Speech, so
 * it is deliberately kept dependency-free and unit-testable in isolation.
 *
 * The server only ever accepts a mono, uncompressed PCM WAV file (see
 * `wav-encoder.ts` on the client, which always produces exactly this
 * format before upload) — never a compressed container (webm/opus, mp4,
 * ogg). That keeps this parser simple and keeps the server from ever
 * needing a codec/GStreamer dependency that isn't verified as available on
 * the Azure App Service Linux Node runtime.
 */

/** 10MB — generous for a ~2 minute mono 16-bit/16kHz WAV recording (see MAX_AUDIO_DURATION_SECONDS), tight enough to bound a single abusive upload. */
export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 2 minutes — long enough to dictate a meeting update or customer observation, short enough to bound both abuse and Azure Speech per-call cost. */
export const MAX_AUDIO_DURATION_SECONDS = 120;

/** RIFF header (12 bytes) + at least one 8-byte chunk header. */
const MIN_WAV_HEADER_BYTES = 20;

/** WAVE_FORMAT_PCM — the only `fmt ` audioFormat this server accepts. */
const WAVE_FORMAT_PCM = 1;

export type WavHeaderInfo = {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  /** Bytes of actual audio payload (the `data` chunk), clamped to what's actually present in the buffer. */
  dataSize: number;
  durationSeconds: number;
};

export type AudioValidationErrorCode =
  | "audio_empty"
  | "audio_too_large"
  | "audio_invalid_format"
  | "audio_too_long";

export type AudioValidationError = {
  ok: false;
  status: 400 | 413;
  code: AudioValidationErrorCode;
  message: string;
};

export type AudioValidationResult = { ok: true; header: WavHeaderInfo } | AudioValidationError;

/**
 * Parses a RIFF/WAVE header and locates the `fmt ` and `data` chunks.
 * Returns `null` for anything that isn't a well-formed, uncompressed PCM
 * WAV buffer — malformed input, a compressed `fmt ` tag (webm/opus, mp3,
 * ...), or a truncated/missing `data` chunk.
 *
 * Duration is derived independently from the parsed sample rate / bit
 * depth / channel count and the *actual* number of bytes present — a
 * client-declared duration is never trusted.
 */
export const parseWavHeader = (buffer: Buffer): WavHeaderInfo | null => {
  if (buffer.length < MIN_WAV_HEADER_BYTES) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let fmt:
    | { audioFormat: number; numChannels: number; sampleRate: number; bitsPerSample: number }
    | null = null;
  let dataSize: number | null = null;

  // Chunks are word-aligned (padded to an even byte count); walk them
  // until we've found both `fmt ` and `data`, or run out of buffer.
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkStart + 16 <= buffer.length) {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    }

    if (chunkId === "data") {
      // Some encoders write a placeholder/streaming size larger than what's
      // actually present (or 0xFFFFFFFF) — clamp to the real buffer length
      // so duration is always derived from bytes that actually exist.
      dataSize = Math.max(0, Math.min(chunkSize, buffer.length - chunkStart));
      break; // `data` is always the last chunk we need
    }

    if (chunkSize < 0) return null; // corrupt/overflowed size
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataSize === null) return null;
  if (fmt.audioFormat !== WAVE_FORMAT_PCM) return null;
  if (fmt.sampleRate <= 0 || fmt.numChannels <= 0 || fmt.bitsPerSample <= 0) return null;

  const byteRate = fmt.sampleRate * fmt.numChannels * (fmt.bitsPerSample / 8);
  const durationSeconds = byteRate > 0 ? dataSize / byteRate : 0;

  return {
    sampleRate: fmt.sampleRate,
    numChannels: fmt.numChannels,
    bitsPerSample: fmt.bitsPerSample,
    dataSize,
    durationSeconds,
  };
};

/**
 * The single validation gate `/api/speech/transcribe` runs before ever
 * calling Azure Speech. Order matters: cheap checks (size) before more
 * expensive parsing, and every rejection carries the HTTP status the route
 * should return verbatim — 413 for "the upload/recording is too big or too
 * long" (an abuse surface), 400 for "this isn't audio we can use".
 */
export const validateAudioUpload = (buffer: Buffer): AudioValidationResult => {
  if (buffer.length === 0) {
    return { ok: false, status: 400, code: "audio_empty", message: "No audio was received." };
  }

  if (buffer.length > MAX_AUDIO_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "audio_too_large",
      message: `Recording exceeds the ${Math.floor(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024))}MB limit.`,
    };
  }

  const header = parseWavHeader(buffer);
  if (!header) {
    return {
      ok: false,
      status: 400,
      code: "audio_invalid_format",
      message: "Expected a mono PCM WAV recording.",
    };
  }

  if (header.durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    return {
      ok: false,
      status: 413,
      code: "audio_too_long",
      message: `Recording exceeds the ${MAX_AUDIO_DURATION_SECONDS}s limit.`,
    };
  }

  return { ok: true, header };
};

/**
 * Fast pre-body-read rejection using the `Content-Length` header alone —
 * lets the route return 413 without ever buffering a multi-hundred-MB
 * upload into memory. This is a *hint*, not the source of truth: the real
 * enforcement is `validateAudioUpload`'s own `buffer.length` check once the
 * body has actually been read (a client can lie about or omit
 * `Content-Length`).
 */
export const isDeclaredContentLengthTooLarge = (contentLength: number): boolean =>
  Number.isFinite(contentLength) && contentLength > MAX_AUDIO_UPLOAD_BYTES;
