import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// SR-011 — ownership binding for the document-attachment pipeline.
//
// Both functions under test carry the `"use server"` module pragma, so they
// are individually POST-able Server Actions. Being imported by an
// authenticated page grants them no protection whatsoever, which is precisely
// why these checks have to live in the functions themselves rather than in a
// page or in middleware.
// ---------------------------------------------------------------------------

const historyQueryMock = vi.hoisted(() => vi.fn());
const historyUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/common/services/cosmos", () => ({
  HistoryContainer: () => ({
    items: { query: historyQueryMock, upsert: historyUpsertMock },
  }),
}));

const currentUserIdMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth-page/helpers", () => ({
  currentUserId: currentUserIdMock,
}));

const deleteDocumentsByFileNameInThreadMock = vi.hoisted(() => vi.fn());
vi.mock("./azure-ai-search/azure-ai-search", () => ({
  DeleteDocumentsByFileNameInThread: (threadId: string, fileName: string) =>
    deleteDocumentsByFileNameInThreadMock(threadId, fileName),
  EnsureIndexIsCreated: vi.fn(),
}));

const recordUploadEventMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/admin/activity-service", () => ({
  RecordUploadEvent: recordUploadEventMock,
}));

vi.mock("@/features/theme/tenant-resolver", () => ({
  getCurrentTenantSlug: async () => "dsv",
}));

vi.mock("@/features/common/navigation-helpers", () => ({
  RevalidateCache: vi.fn(),
}));

vi.mock("@/features/common/services/document-intelligence", () => ({
  DocumentIntelligenceInstance: vi.fn(),
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "new-doc-id",
}));

import { CreateChatDocument, RemoveChatDocument } from "./chat-document-service";
import { CHAT_DOCUMENT_ATTRIBUTE, CHAT_THREAD_ATTRIBUTE } from "./models";

const ATTACKER = "tenant-a:attacker-oid";
const VICTIM_THREAD = "victim-thread-nanoid";

type QueryParam = { name: string; value: unknown };
type QuerySpec = { query: string; parameters: QueryParam[] };

const paramOf = (spec: QuerySpec, name: string) =>
  spec.parameters.find((p) => p.name === name)?.value;

/**
 * Routes a query by its `@type` parameter. `ownedThreadIds` is the set of
 * thread ids the caller actually owns — anything else returns a count of 0,
 * which is what Cosmos would do for a thread belonging to another user.
 */
const mockCosmos = (opts: {
  ownedThreadIds: string[];
  documents?: Array<Record<string, unknown>>;
}) => {
  historyQueryMock.mockImplementation((spec: QuerySpec) => {
    const type = paramOf(spec, "@type");

    if (type === CHAT_THREAD_ATTRIBUTE) {
      const id = paramOf(spec, "@id") as string;
      const owns = opts.ownedThreadIds.includes(id);
      return { fetchAll: async () => ({ resources: [owns ? 1 : 0] }) };
    }

    if (type === CHAT_DOCUMENT_ATTRIBUTE) {
      return { fetchAll: async () => ({ resources: opts.documents ?? [] }) };
    }

    return { fetchAll: async () => ({ resources: [] }) };
  });
};

describe("SR-011 — CreateChatDocument binds the attachment to a thread the caller owns", () => {
  beforeEach(() => {
    historyQueryMock.mockReset();
    historyUpsertMock.mockReset();
    recordUploadEventMock.mockReset();
    currentUserIdMock.mockReset();
    currentUserIdMock.mockResolvedValue(ATTACKER);
    historyUpsertMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
  });

  it("refuses to attach a document to another user's thread", async () => {
    mockCosmos({ ownedThreadIds: ["attackers-own-thread"] });

    const result = await CreateChatDocument("Q3 Pricing.pdf", VICTIM_THREAD);

    expect(result.status).toBe("UNAUTHORIZED");
    // The row must never be written: it is the row's existence that gives the
    // attacker a legitimately-owned handle pointing at the victim's thread,
    // which is what turns RemoveChatDocument into a deletion primitive.
    expect(historyUpsertMock).not.toHaveBeenCalled();
    expect(recordUploadEventMock).not.toHaveBeenCalled();
  });

  it("still allows attaching to a thread the caller does own", async () => {
    mockCosmos({ ownedThreadIds: ["my-thread"] });

    const result = await CreateChatDocument("notes.pdf", "my-thread");

    expect(result.status).toBe("OK");
    expect(historyUpsertMock).toHaveBeenCalledTimes(1);
    expect(historyUpsertMock.mock.calls[0][0]).toMatchObject({
      chatThreadId: "my-thread",
      userId: ATTACKER,
      name: "notes.pdf",
    });
  });
});

describe("SR-011 — RemoveChatDocument will not delete search chunks from a thread the caller does not own", () => {
  beforeEach(() => {
    historyQueryMock.mockReset();
    historyUpsertMock.mockReset();
    currentUserIdMock.mockReset();
    currentUserIdMock.mockResolvedValue(ATTACKER);
    historyUpsertMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
    deleteDocumentsByFileNameInThreadMock.mockReset();
    deleteDocumentsByFileNameInThreadMock.mockResolvedValue(undefined);
  });

  it("blocks the attack even when the caller legitimately owns the document row", async () => {
    // The precondition that makes this the interesting case: the row passes the
    // pre-existing `r.userId === callerId` check, because the attacker really
    // does own it. Owning the row is not owning the thread.
    mockCosmos({
      ownedThreadIds: [],
      documents: [
        {
          id: "attacker-row",
          type: CHAT_DOCUMENT_ATTRIBUTE,
          userId: ATTACKER,
          chatThreadId: VICTIM_THREAD,
          name: "Q3 Pricing.pdf",
          isDeleted: false,
        },
      ],
    });

    const result = await RemoveChatDocument("attacker-row");

    expect(result.status).toBe("UNAUTHORIZED");
    // The AI Search delete is filtered by thread + filename with NO user
    // clause, so reaching it at all would destroy the victim's indexed chunks.
    expect(deleteDocumentsByFileNameInThreadMock).not.toHaveBeenCalled();
    expect(historyUpsertMock).not.toHaveBeenCalled();
  });

  it("still deletes normally when the caller owns both the row and the thread", async () => {
    mockCosmos({
      ownedThreadIds: ["my-thread"],
      documents: [
        {
          id: "my-row",
          type: CHAT_DOCUMENT_ATTRIBUTE,
          userId: ATTACKER,
          chatThreadId: "my-thread",
          name: "notes.pdf",
          isDeleted: false,
        },
      ],
    });

    const result = await RemoveChatDocument("my-row");

    expect(result.status).toBe("OK");
    expect(historyUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "my-row", isDeleted: true })
    );
    expect(deleteDocumentsByFileNameInThreadMock).toHaveBeenCalledWith(
      "my-thread",
      "notes.pdf"
    );
  });
});
