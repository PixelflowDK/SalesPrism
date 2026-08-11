import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-boundary mocks. EnsureChatThreadOperation is the Stage 4 security
// fix under test: a non-owner, non-admin caller must get UNAUTHORIZED with
// NO thread payload leaked. We mock every Azure/auth boundary
// chat-thread-service.ts touches so this runs with no network at all, and
// control currentUserId()/getCurrentUser() per test to simulate "owner",
// "different user", and "admin" callers.
// ---------------------------------------------------------------------------
const queryMock = vi.fn();

vi.mock("@/features/common/services/cosmos", () => ({
  HistoryContainer: () => ({
    items: {
      query: queryMock,
      upsert: vi.fn(),
      create: vi.fn(),
    },
  }),
  ConfigContainer: () => ({
    items: { query: vi.fn(), upsert: vi.fn(), create: vi.fn() },
  }),
}));

const getCurrentUserMock = vi.fn();
const currentUserIdMock = vi.fn();
const userSessionMock = vi.fn();

vi.mock("@/features/auth-page/helpers", () => ({
  getCurrentUser: () => getCurrentUserMock(),
  currentUserId: () => currentUserIdMock(),
  userSession: () => userSessionMock(),
}));

vi.mock("@/features/common/navigation-helpers", () => ({
  RedirectToChatThread: vi.fn(),
  RedirectToPage: vi.fn(),
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-unique-id",
}));

vi.mock("@/features/theme/theme-config", () => ({
  CHAT_DEFAULT_PERSONA: "Default Persona",
  NEW_CHAT_NAME: "New Chat",
}));

vi.mock("./azure-ai-search/azure-ai-search", () => ({
  DeleteDocuments: vi.fn(),
}));

vi.mock("./chat-document-service", () => ({
  FindAllChatDocuments: vi.fn(),
}));

vi.mock("./chat-message-service", () => ({
  FindAllChatMessagesForCurrentUser: vi.fn(),
}));

import { EnsureChatThreadOperation, FindChatThreadsByCoachingContext } from "./chat-thread-service";
import { CHAT_THREAD_ATTRIBUTE, ChatThreadModel } from "./models";

const OWNER_HASHED_ID = "hashed-owner-abc";
const OTHER_USER_HASHED_ID = "hashed-someone-else";
const THREAD_ID = "thread-1";

const makeThread = (overrides: Partial<ChatThreadModel> = {}): ChatThreadModel => ({
  id: THREAD_ID,
  name: "Some thread",
  createdAt: new Date(),
  lastMessageAt: new Date(),
  userId: OWNER_HASHED_ID,
  useName: "Owner Name",
  isDeleted: false,
  bookmarked: false,
  personaMessage: "",
  personaMessageTitle: "Default Persona",
  extension: [],
  type: CHAT_THREAD_ATTRIBUTE,
  coachingContext: null,
  ...overrides,
});

const mockQueryReturns = (thread: ChatThreadModel | null) => {
  queryMock.mockReturnValue({
    fetchAll: async () => ({ resources: thread ? [thread] : [] }),
  });
};

describe("EnsureChatThreadOperation — Stage 4 security fix (non-owner/non-admin isolation)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    getCurrentUserMock.mockReset();
    currentUserIdMock.mockReset();
  });

  it("returns UNAUTHORIZED with NO thread payload when the caller is neither the owner nor an admin", async () => {
    mockQueryReturns(makeThread({ userId: OWNER_HASHED_ID }));
    currentUserIdMock.mockResolvedValue(OTHER_USER_HASHED_ID);
    getCurrentUserMock.mockResolvedValue({ isAdmin: false });

    const result = await EnsureChatThreadOperation(THREAD_ID);

    expect(result.status).toBe("UNAUTHORIZED");
    // The whole point of the Stage 4 fix: an UNAUTHORIZED response must not
    // carry the thread (or anything else) under a `response` key.
    expect("response" in result).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/Some thread/);
  });

  it("returns OK with the thread when the caller IS the owner", async () => {
    mockQueryReturns(makeThread({ userId: OWNER_HASHED_ID }));
    currentUserIdMock.mockResolvedValue(OWNER_HASHED_ID);
    getCurrentUserMock.mockResolvedValue({ isAdmin: false });

    const result = await EnsureChatThreadOperation(THREAD_ID);

    expect(result.status).toBe("OK");
    if (result.status === "OK") {
      expect(result.response.id).toBe(THREAD_ID);
    }
  });

  it("returns OK with the thread when the caller is an admin, even if not the owner", async () => {
    mockQueryReturns(makeThread({ userId: OWNER_HASHED_ID }));
    currentUserIdMock.mockResolvedValue(OTHER_USER_HASHED_ID);
    getCurrentUserMock.mockResolvedValue({ isAdmin: true });

    const result = await EnsureChatThreadOperation(THREAD_ID);

    expect(result.status).toBe("OK");
  });

  it("propagates NOT_FOUND as-is when the thread doesn't exist for this query (never reached the ownership check)", async () => {
    mockQueryReturns(null);

    const result = await EnsureChatThreadOperation(THREAD_ID);

    expect(result.status).toBe("NOT_FOUND");
    // getCurrentUser/currentUserId should not even be consulted once the
    // underlying find already failed.
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });
});

// W3 (`/coach`) — "history of coaching sessions the seller can return to".
describe("FindChatThreadsByCoachingContext", () => {
  beforeEach(() => {
    queryMock.mockReset();
    currentUserIdMock.mockReset();
  });

  it("filters by type, userId, isDeleted=false AND the requested coachingContext, partition-scoped to the caller", async () => {
    currentUserIdMock.mockResolvedValue(OWNER_HASHED_ID);
    mockQueryReturns(makeThread({ coachingContext: "conversation-coaching" }));

    const result = await FindChatThreadsByCoachingContext("conversation-coaching");

    expect(result.status).toBe("OK");
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.arrayContaining([
          { name: "@type", value: CHAT_THREAD_ATTRIBUTE },
          { name: "@userId", value: OWNER_HASHED_ID },
          { name: "@isDeleted", value: false },
          { name: "@coachingContext", value: "conversation-coaching" },
        ]),
      }),
      { partitionKey: OWNER_HASHED_ID }
    );
  });

  it("returns an ERROR result (never throws) when the underlying query rejects", async () => {
    currentUserIdMock.mockResolvedValue(OWNER_HASHED_ID);
    queryMock.mockImplementation(() => {
      throw new Error("cosmos unavailable");
    });

    const result = await FindChatThreadsByCoachingContext("meeting-prep");

    expect(result.status).toBe("ERROR");
  });
});
