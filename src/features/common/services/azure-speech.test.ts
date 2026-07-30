import { ResultReason } from "microsoft-cognitiveservices-speech-sdk";
import { describe, expect, it } from "vitest";
import { mapRecognitionOutcome } from "./azure-speech";

/**
 * `mapRecognitionOutcome` is the pure boundary between a raw Azure Speech
 * SDK result and this app's transcription outcome — see `transcribeAudio`
 * in azure-speech.ts. It never opens a network connection, so it's
 * unit-testable without a real (or mocked) WebSocket to Azure.
 */
describe("mapRecognitionOutcome", () => {
  it("maps RecognizedSpeech to a recognized outcome carrying the text", () => {
    const outcome = mapRecognitionOutcome(ResultReason.RecognizedSpeech, "hello world");
    expect(outcome).toEqual({ outcome: "recognized", text: "hello world" });
  });

  it("maps NoMatch to a no-match outcome, ignoring any text", () => {
    const outcome = mapRecognitionOutcome(ResultReason.NoMatch, "");
    expect(outcome).toEqual({ outcome: "no-match" });
  });

  it("throws with the SDK's errorDetails for a Canceled result", () => {
    expect(() =>
      mapRecognitionOutcome(ResultReason.Canceled, "", "connection failure: 1006")
    ).toThrow("connection failure: 1006");
  });

  it("throws a generic message for an unexpected reason with no errorDetails", () => {
    expect(() => mapRecognitionOutcome(ResultReason.RecognizingSpeech, "partial")).toThrow(
      /Unexpected speech recognition result/
    );
  });
});
