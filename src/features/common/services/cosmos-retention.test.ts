import { beforeEach, describe, expect, it, vi } from "vitest";

const historyReadMock = vi.fn();
const historyReplaceMock = vi.fn();
const configReadMock = vi.fn();
const configReplaceMock = vi.fn();

vi.mock("./cosmos", () => ({
  HistoryContainer: () => ({ read: historyReadMock, replace: historyReplaceMock }),
  ConfigContainer: () => ({ read: configReadMock, replace: configReplaceMock }),
}));

vi.mock("./safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  ACTIVITY_EVENT_TTL_SECONDS,
  CHAT_HISTORY_TTL_SECONDS,
  EnsureContainerRetentionPolicies,
  __resetRetentionMemoizationForTests,
} from "./cosmos-retention";

// SAD v2.7 §32.1 data-classification table — regression guard against the
// TTL values silently drifting from what that table (and the DPIA in §32.4
// that cites them as a mitigation) actually promises.
describe("SAD §32.1 retention TTL constants", () => {
  it("chat prompts/completions + uploaded-document metadata: 90 days", () => {
    expect(CHAT_HISTORY_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
    expect(CHAT_HISTORY_TTL_SECONDS).toBe(7776000);
  });

  it("activity/usage logs: 30 days", () => {
    expect(ACTIVITY_EVENT_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(ACTIVITY_EVENT_TTL_SECONDS).toBe(2592000);
  });
});

describe("EnsureContainerRetentionPolicies", () => {
  beforeEach(() => {
    __resetRetentionMemoizationForTests();
    historyReadMock.mockReset();
    historyReplaceMock.mockReset();
    configReadMock.mockReset();
    configReplaceMock.mockReset();
  });

  it("sets HistoryContainer.defaultTtl to the 90-day chat TTL when not already set", async () => {
    historyReadMock.mockResolvedValue({ resource: { id: "history", defaultTtl: undefined } });
    configReadMock.mockResolvedValue({ resource: { id: "config", defaultTtl: -1 } });

    await EnsureContainerRetentionPolicies();

    expect(historyReplaceMock).toHaveBeenCalledTimes(1);
    expect(historyReplaceMock.mock.calls[0][0]).toMatchObject({ defaultTtl: 7776000 });
  });

  it("sets ConfigContainer.defaultTtl to -1 (TTL enabled, nothing expires by default) — never a positive number that would silently expire TenantTheme/UserAccount", async () => {
    historyReadMock.mockResolvedValue({ resource: { id: "history", defaultTtl: 7776000 } });
    configReadMock.mockResolvedValue({ resource: { id: "config", defaultTtl: undefined } });

    await EnsureContainerRetentionPolicies();

    expect(configReplaceMock).toHaveBeenCalledTimes(1);
    expect(configReplaceMock.mock.calls[0][0]).toMatchObject({ defaultTtl: -1 });
  });

  it("is a no-op when both containers already have the correct defaultTtl", async () => {
    historyReadMock.mockResolvedValue({ resource: { id: "history", defaultTtl: 7776000 } });
    configReadMock.mockResolvedValue({ resource: { id: "config", defaultTtl: -1 } });

    await EnsureContainerRetentionPolicies();

    expect(historyReplaceMock).not.toHaveBeenCalled();
    expect(configReplaceMock).not.toHaveBeenCalled();
  });

  it("is memoized per process — a second call does not re-read the containers", async () => {
    historyReadMock.mockResolvedValue({ resource: { id: "history", defaultTtl: 7776000 } });
    configReadMock.mockResolvedValue({ resource: { id: "config", defaultTtl: -1 } });

    await EnsureContainerRetentionPolicies();
    await EnsureContainerRetentionPolicies();

    expect(historyReadMock).toHaveBeenCalledTimes(1);
    expect(configReadMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when the Cosmos control-plane call fails — best-effort, must never block the app shell", async () => {
    historyReadMock.mockRejectedValue(new Error("boom"));
    configReadMock.mockRejectedValue(new Error("boom"));

    await expect(EnsureContainerRetentionPolicies()).resolves.toBeUndefined();
  });
});
