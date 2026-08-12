import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const createAzureMock = vi.hoisted(() => vi.fn(() => vi.fn()));
vi.mock("@ai-sdk/azure", () => ({ createAzure: createAzureMock }));
vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {},
  getBearerTokenProvider: () => async () => "token",
}));

/**
 * SR-015 — the Azure OpenAI API version must not be a dated preview by default.
 *
 * The app pinned `2025-01-01-preview`, in code AND in the Bicep default. The
 * gpt-5.x deployments reject it outright with "API version not supported", so
 * every chat request failed with a generic error in the UI. Nothing caught it:
 * the incompatibility is between a pinned string and whatever model Azure has
 * on the other side, which no mock can represent.
 *
 * What CAN be tested is the property that caused it — that the default is a
 * forward-compatible surface rather than a date that silently expires the next
 * time a model generation ships.
 */
describe("SR-015 — Azure OpenAI API version default", () => {
  const original = process.env.AZURE_OPENAI_API_VERSION;

  beforeEach(() => {
    vi.resetModules();
    createAzureMock.mockClear();
    process.env.AZURE_OPENAI_API_INSTANCE_NAME = "oai-test";
    process.env.AZURE_OPENAI_CHAT_DEPLOYMENT = "chat";
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = "embed";
    delete process.env.AZURE_OPENAI_API_VERSION;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AZURE_OPENAI_API_VERSION;
    else process.env.AZURE_OPENAI_API_VERSION = original;
  });

  it("defaults to the version-less v1 surface, never a dated preview", async () => {
    const { getChatModel } = await import("./azure-ai");
    getChatModel();

    expect(createAzureMock).toHaveBeenCalledTimes(1);
    const apiVersion = createAzureMock.mock.calls[0][0].apiVersion as string;

    expect(apiVersion).toBe("v1");
    // The actual defect shape: a YYYY-MM-DD[-preview] string. Asserting the
    // absence of that pattern is what keeps someone from "fixing" a future
    // incompatibility by pinning a newer date, which just resets the clock.
    expect(apiVersion).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("still honours an explicit override, so a customer can be pinned deliberately", async () => {
    process.env.AZURE_OPENAI_API_VERSION = "2026-05-01-preview";

    const { getChatModel } = await import("./azure-ai");
    getChatModel();

    expect(createAzureMock.mock.calls[0][0].apiVersion).toBe("2026-05-01-preview");
  });

  it("the Bicep default matches the code default — they drifted apart once already", () => {
    // Both sides pinned the same stale date, so the app setting kept the bug
    // alive even after the code fallback would have been corrected. Asserting
    // they agree is cheap and catches the half-fix.
    const bicep = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "..", "infra", "main.bicep"),
      "utf8"
    );
    const match = bicep.match(/param openAiApiVersion string = '([^']+)'/);

    expect(match, "openAiApiVersion param not found in infra/main.bicep").not.toBeNull();
    expect(match?.[1]).toBe("v1");
  });
});
