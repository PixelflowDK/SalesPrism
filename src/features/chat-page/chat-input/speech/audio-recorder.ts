"use client";

import { downsampleFloat32, encodeMonoPcmWav, TARGET_SAMPLE_RATE } from "./wav-encoder";

/**
 * Browser-only microphone capture (SR-003 remediation). Uses
 * `MediaRecorder` to capture the utterance (whatever compressed codec the
 * browser natively supports — webm/opus, ogg/opus, mp4/aac), then decodes
 * it via the browser's own `AudioContext.decodeAudioData` (the same decode
 * path `<audio>`/`<video>` playback uses) and re-encodes it as a plain
 * mono 16kHz PCM WAV entirely client-side.
 *
 * This is deliberate: it means the *server* (`/api/speech/transcribe`)
 * never has to decode a compressed audio format itself — it always
 * receives a plain WAV file it can hand straight to
 * `AudioConfig.fromWavFileInput(Buffer)` (see `azure-speech.ts`). No audio
 * byte ever goes anywhere but this app's own Route Handler — this module
 * has no Azure import at all.
 */

/** Mirrors `MAX_AUDIO_DURATION_SECONDS` in `audio-validation.ts` — a client-side safety net, not the enforcement point (the server re-validates independently). */
const MAX_RECORDING_MS = 120_000;

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];

const pickMimeType = (): string | undefined => {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
};

export type ActiveRecording = {
  /** Stops recording, decodes, and resolves a mono 16kHz PCM WAV `Blob`. */
  stop: () => Promise<Blob>;
  /** Aborts the recording and releases the microphone without producing a result. */
  cancel: () => void;
};

/**
 * Requests microphone access and starts recording immediately. Throws
 * (propagating `getUserMedia`'s rejection, e.g. `NotAllowedError`) if the
 * user denies/has no microphone — callers should catch this and show a
 * friendly error rather than a raw permission-error message.
 */
export const startRecording = async (): Promise<ActiveRecording> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());

  let finalized = false;
  const autoStopTimer = setTimeout(() => {
    if (recorder.state !== "inactive") recorder.stop();
  }, MAX_RECORDING_MS);

  recorder.start();

  const decodeToWav = async (): Promise<Blob> => {
    const recordedBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    const arrayBuffer = await recordedBlob.arrayBuffer();

    const AudioContextCtor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextCtor();

    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0); // mono is sufficient for STT
      const resampled = downsampleFloat32(
        channelData,
        audioBuffer.sampleRate,
        TARGET_SAMPLE_RATE
      );
      const wavBuffer = encodeMonoPcmWav(
        resampled,
        Math.min(audioBuffer.sampleRate, TARGET_SAMPLE_RATE)
      );
      return new Blob([wavBuffer], { type: "audio/wav" });
    } finally {
      await audioContext.close();
    }
  };

  const stop = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      if (finalized) {
        reject(new Error("Recording already finalized."));
        return;
      }
      finalized = true;

      recorder.onstop = () => {
        clearTimeout(autoStopTimer);
        stopTracks();
        decodeToWav().then(resolve, reject);
      };

      if (recorder.state === "inactive") {
        // Recorder already stopped (e.g. hit MAX_RECORDING_MS) before the
        // caller asked to stop — decode what we already captured.
        clearTimeout(autoStopTimer);
        stopTracks();
        decodeToWav().then(resolve, reject);
        return;
      }

      recorder.stop();
    });

  return {
    stop,
    cancel: () => {
      finalized = true;
      clearTimeout(autoStopTimer);
      stopTracks();
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
};
