import { showError } from "@/features/globals/global-message-store";
import { proxy, useSnapshot } from "valtio";
import { speechToTextStore } from "./use-speech-to-text";

let currentAudio: HTMLAudioElement | undefined;
let currentObjectUrl: string | undefined;

/**
 * SR-003 remediation follow-through: playback used to open a browser<->
 * Azure WebSocket via the client-side Speech SDK (same shared token route
 * as STT). Now fetches finished MP3 bytes from `/api/speech/synthesize`
 * (server-side Azure Speech call — see `azure-speech.ts`) and plays them
 * with a plain `HTMLAudioElement` from a local object URL. No Azure SDK
 * import anywhere in this module.
 */
class TextToSpeech {
  public isPlaying: boolean = false;

  public stopPlaying() {
    this.isPlaying = false;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    this.revokeCurrentUrl();
  }

  private revokeCurrentUrl() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = undefined;
    }
  }

  public async textToSpeech(textToSpeak: string) {
    if (this.isPlaying) {
      this.stopPlaying();
    }

    try {
      const response = await fetch("/api/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        showError(body?.message ?? "Voice output isn't available right now.");
        return;
      }

      const audioBlob = await response.blob();
      const objectUrl = URL.createObjectURL(audioBlob);
      currentObjectUrl = objectUrl;

      const audio = new Audio(objectUrl);
      currentAudio = audio;

      audio.onended = () => {
        this.isPlaying = false;
        this.revokeCurrentUrl();
      };
      audio.onerror = () => {
        this.isPlaying = false;
        showError("Voice playback failed.");
        this.revokeCurrentUrl();
      };

      await audio.play();
      this.isPlaying = true;
    } catch {
      showError("Voice output isn't available right now.");
    }
  }

  public speak(value: string) {
    if (speechToTextStore.userDidUseMicrophone()) {
      textToSpeechStore.textToSpeech(value);
      speechToTextStore.resetMicrophoneUsed();
    }
  }
}

export const textToSpeechStore = proxy(new TextToSpeech());

export const useTextToSpeech = () => {
  return useSnapshot(textToSpeechStore);
};
