import { showError } from "@/features/globals/global-message-store";
import { proxy, useSnapshot } from "valtio";
import { chatStore } from "../../chat-store";
import { startRecording, type ActiveRecording } from "./audio-recorder";

let activeRecording: ActiveRecording | undefined;

/**
 * SR-003 remediation, backlog F-02: record locally with `MediaRecorder`
 * (`audio-recorder.ts`), upload the finished WAV blob to
 * `/api/speech/transcribe` once recording stops, then run STT cleanup
 * (`/api/speech/cleanup`) on the raw transcript — same two-step flow as
 * before, just with the recognition itself moved server-side. There are no
 * real-time interim results anymore (no browser<->Azure WebSocket to
 * stream them from) — `isMicrophoneReady` reflects "actively recording"
 * and the new `isTranscribing` reflects "uploaded, waiting on the
 * transcript", so the UI (`microphone.tsx`) can show an honest
 * recording -> transcribing -> done sequence instead of pretending live
 * dictation still happens.
 */
class SpeechToText {
  public isMicrophoneUsed: boolean = false;
  /** `true` while actively recording (renamed meaning from the old live-dictation implementation — the mic button UI already keyed off this exact flag for its "recording" visual state). */
  public isMicrophoneReady: boolean = false;
  /** `true` while the recorded clip has been uploaded and is awaiting a transcript. */
  public isTranscribing: boolean = false;
  /** STT cleanup (backlog F-02) round-trip in flight — used to disable send while the cleaned text is still arriving. */
  public isCleaningUp: boolean = false;

  public async startRecognition() {
    if (this.isMicrophoneReady) return; // already recording — guards a double press-and-hold fire

    try {
      activeRecording = await startRecording();
      this.isMicrophoneReady = true;
      this.isMicrophoneUsed = true;
    } catch {
      showError(
        "Couldn't access the microphone. Check your browser's microphone permission and try again."
      );
    }
  }

  public async stopRecognition() {
    if (!activeRecording || !this.isMicrophoneReady) return;

    const recording = activeRecording;
    activeRecording = undefined;
    this.isMicrophoneReady = false;
    this.isTranscribing = true;

    try {
      const wavBlob = await recording.stop();
      const rawText = await this.transcribe(wavBlob);
      if (rawText) {
        chatStore.updateInput(rawText);
        await this.runSttCleanup(rawText);
      }
    } catch {
      showError("Voice input couldn't be transcribed. Please try again or type your message.");
    } finally {
      this.isTranscribing = false;
    }
  }

  /**
   * Uploads the recorded WAV blob to the server-side transcription route
   * (`azure-speech.ts#transcribeAudio`, proxied via
   * `/api/speech/transcribe`). Never throws — any failure shows a friendly
   * error and returns an empty string, leaving the (still-editable) input
   * field exactly as it was.
   */
  private async transcribe(wavBlob: Blob): Promise<string> {
    try {
      const response = await fetch("/api/speech/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wavBlob,
      });

      const body = (await response.json().catch(() => null)) as {
        error?: boolean;
        text?: string;
        message?: string;
        noSpeechDetected?: boolean;
      } | null;

      if (!response.ok || !body || body.error) {
        showError(body?.message ?? "Voice input isn't available right now.");
        return "";
      }

      if (body.noSpeechDetected) {
        showError("Didn't catch any speech in that recording — try again.");
        return "";
      }

      return body.text ?? "";
    } catch {
      showError("Voice input isn't available right now.");
      return "";
    }
  }

  /**
   * Backlog F-02 STT post-processing: one `generateObject` call
   * (`/api/speech/cleanup`, features/sales-coach/stt-cleanup.ts) that
   * removes filler words and classifies intent. The cleaned text replaces
   * the raw transcript in the (still-editable) input field. On ANY
   * failure — network error, non-2xx, malformed body — the raw transcript
   * already shown in the input (see `stopRecognition` above) is left
   * exactly as-is; this must never block or interrupt the seller.
   */
  private async runSttCleanup(rawText: string) {
    const trimmed = rawText.trim();
    if (trimmed.length === 0) return;

    this.isCleaningUp = true;
    try {
      const response = await fetch("/api/speech/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: trimmed }),
      });

      if (response.ok) {
        const body = (await response.json()) as { cleanedText?: string };
        if (body.cleanedText) {
          chatStore.updateInput(body.cleanedText);
        }
      }
    } catch {
      // Fallback is a no-op: the raw transcript is already the input value.
    } finally {
      this.isCleaningUp = false;
    }
  }

  public userDidUseMicrophone() {
    return this.isMicrophoneUsed;
  }

  public resetMicrophoneUsed() {
    this.isMicrophoneUsed = false;
  }
}
export const speechToTextStore = proxy(new SpeechToText());

export const useSpeechToText = () => {
  return useSnapshot(speechToTextStore);
};
