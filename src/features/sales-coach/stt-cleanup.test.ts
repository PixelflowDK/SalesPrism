import { afterEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above all imports/top-level statements —
// `vi.hoisted` lets this mock fn declaration be hoisted right along with
// it, avoiding a "Cannot access before initialization" TDZ error.
const generateObjectMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  generateObject: generateObjectMock,
}));

vi.mock("@/features/common/services/azure-ai", () => ({
  getChatModel: () => "fake-chat-model",
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { cleanupSttTranscript } from "./stt-cleanup";

describe("cleanupSttTranscript", () => {
  afterEach(() => {
    generateObjectMock.mockReset();
  });

  it("short-circuits an empty/whitespace-only transcript without calling the model", async () => {
    const result = await cleanupSttTranscript("   ");
    expect(result).toEqual({ category: "free-chat", cleanedText: "   " });
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns the model's cleaned object on a successful call", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { category: "meeting-update", cleanedText: "Cleaned meeting update." },
    });

    const result = await cleanupSttTranscript("øhm altså mødet gik meget godt ikk");

    expect(result).toEqual({ category: "meeting-update", cleanedText: "Cleaned meeting update." });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the raw transcript + free-chat category when the model call throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("rate limited"));

    const result = await cleanupSttTranscript("raw dictation text, unmodified");

    expect(result).toEqual({
      category: "free-chat",
      cleanedText: "raw dictation text, unmodified",
    });
  });

  it("never throws out of the fallback path even when the model call rejects with a non-Error", async () => {
    generateObjectMock.mockRejectedValueOnce("weird non-Error rejection");

    await expect(cleanupSttTranscript("still falls back")).resolves.toEqual({
      category: "free-chat",
      cleanedText: "still falls back",
    });
  });
});
