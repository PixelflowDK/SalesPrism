import { afterEach, describe, expect, it, vi } from "vitest";

const userHashedIdMock = vi.hoisted(() => vi.fn());
const cleanupSttTranscriptMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth-page/helpers", () => ({
  userHashedId: userHashedIdMock,
}));

vi.mock("@/features/sales-coach/stt-cleanup", () => ({
  cleanupSttTranscript: cleanupSttTranscriptMock,
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  newRequestId: () => "test-request-id",
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "./route";

const jsonRequest = (body: unknown) =>
  new Request("http://localhost/api/speech/cleanup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/speech/cleanup — CR2-4 auth recheck + body cap", () => {
  afterEach(() => {
    userHashedIdMock.mockReset();
    cleanupSttTranscriptMock.mockReset();
  });

  it("returns 401 and never calls cleanupSttTranscript when there is no session (defense-in-depth against a middleware matcher regression)", async () => {
    userHashedIdMock.mockRejectedValue(new Error("no session"));

    const response = await POST(jsonRequest({ rawText: "hello" }));

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("unauthorized");
    expect(cleanupSttTranscriptMock).not.toHaveBeenCalled();
  });

  it("rejects rawText over the character cap with 413 without calling the model (unbounded AOAI token-sink guard)", async () => {
    userHashedIdMock.mockResolvedValue("hashed-user-id");

    const oversized = "a".repeat(8001);
    const response = await POST(jsonRequest({ rawText: oversized }));

    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.code).toBe("raw_text_too_large");
    expect(cleanupSttTranscriptMock).not.toHaveBeenCalled();
  });

  it("accepts rawText right at the character cap", async () => {
    userHashedIdMock.mockResolvedValue("hashed-user-id");
    cleanupSttTranscriptMock.mockResolvedValue({ category: "free-chat", cleanedText: "ok" });

    const atCap = "a".repeat(8000);
    const response = await POST(jsonRequest({ rawText: atCap }));

    expect(response.status).toBe(200);
    expect(cleanupSttTranscriptMock).toHaveBeenCalledWith(atCap);
  });

  it("still processes a normal authenticated request under the cap", async () => {
    userHashedIdMock.mockResolvedValue("hashed-user-id");
    cleanupSttTranscriptMock.mockResolvedValue({
      category: "meeting-update",
      cleanedText: "Cleaned text.",
    });

    const response = await POST(jsonRequest({ rawText: "øhm mødet gik godt" }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ error: false, category: "meeting-update", cleanedText: "Cleaned text." });
  });
});
