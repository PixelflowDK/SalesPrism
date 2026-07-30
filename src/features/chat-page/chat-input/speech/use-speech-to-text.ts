import { showError } from "@/features/globals/global-message-store";
import {
  AudioConfig,
  AutoDetectSourceLanguageConfig,
  SpeechRecognizer,
} from "microsoft-cognitiveservices-speech-sdk";
import { proxy, useSnapshot } from "valtio";
import { chatStore } from "../../chat-store";
import { buildSpeechConfig, GetSpeechToken } from "./speech-service";

let speechRecognizer: SpeechRecognizer | undefined = undefined;

/**
 * Sales Coach 360 languages (backlog F-02 §"Teknisk implementation"): dansk,
 * norsk, svensk, engelsk, tysk — supersedes the pre-migration
 * en-US/zh-CN/it-IT/pt-BR list, which didn't match any of this platform's
 * actual Nordic B2B customer languages.
 */
const SUPPORTED_SPEECH_LANGUAGES = ["da-DK", "nb-NO", "sv-SE", "en-US", "de-DE"];

class SpeechToText {
  public isMicrophoneUsed: boolean = false;
  public isMicrophoneReady: boolean = false;
  /** STT cleanup (backlog F-02) round-trip in flight — used to disable send while the cleaned text is still arriving. */
  public isCleaningUp: boolean = false;

  /** Accumulated FINAL (not interim) recognized text for this recording session — the input sent to STT cleanup on stop. */
  private finalizedText: string = "";

  public async startRecognition() {
    const token = await GetSpeechToken();

    if (token.error) {
      showError(token.errorMessage);
      return;
    }

    this.finalizedText = "";
    this.isMicrophoneReady = true;
    this.isMicrophoneUsed = true;

    const speechConfig = buildSpeechConfig(token);

    const audioConfig = AudioConfig.fromDefaultMicrophoneInput();

    const autoDetectSourceLanguageConfig =
      AutoDetectSourceLanguageConfig.fromLanguages(SUPPORTED_SPEECH_LANGUAGES);

    const recognizer = SpeechRecognizer.FromConfig(
      speechConfig,
      autoDetectSourceLanguageConfig,
      audioConfig
    );

    speechRecognizer = recognizer;

    recognizer.recognizing = (s, e) => {
      // Interim preview: already-finalized segments + the current in-flight
      // phrase, so a pause mid-dictation doesn't erase what came before it.
      const preview = [this.finalizedText, e.result.text].filter(Boolean).join(" ");
      chatStore.updateInput(preview);
    };

    recognizer.recognized = (s, e) => {
      if (e.result.text) {
        this.finalizedText = [this.finalizedText, e.result.text].filter(Boolean).join(" ");
        chatStore.updateInput(this.finalizedText);
      }
    };

    recognizer.canceled = (s, e) => {
      showError(e.errorDetails);
    };

    recognizer.startContinuousRecognitionAsync();
  }

  public stopRecognition() {
    if (speechRecognizer) {
      const recognizer = speechRecognizer;
      recognizer.stopContinuousRecognitionAsync(() => {
        this.isMicrophoneReady = false;
        void this.runSttCleanup();
      });
    }
  }

  /**
   * Backlog F-02 STT post-processing: one `generateObject` call
   * (`/api/speech/cleanup`, features/sales-coach/stt-cleanup.ts) that
   * removes filler words and classifies intent. The cleaned text replaces
   * the raw transcript in the (still-editable) input field. On ANY
   * failure — network error, non-2xx, malformed body — the raw transcript
   * already shown in the input is left exactly as-is; this must never
   * block or interrupt the seller.
   */
  private async runSttCleanup() {
    const rawText = this.finalizedText.trim();
    if (rawText.length === 0) return;

    this.isCleaningUp = true;
    try {
      const response = await fetch("/api/speech/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
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
      this.finalizedText = "";
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
