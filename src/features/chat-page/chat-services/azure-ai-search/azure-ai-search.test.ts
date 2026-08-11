import { beforeEach, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();
const deleteDocumentsMock = vi.fn();

vi.mock("@/features/common/services/ai-search", () => ({
  AzureAISearchInstance: () => ({
    search: searchMock,
    deleteDocuments: deleteDocumentsMock,
  }),
  AzureAISearchIndexClientInstance: vi.fn(),
}));

vi.mock("@/features/common/services/azure-ai", () => ({
  AZURE_OPENAI_EMBEDDING_DIMENSIONS: 3072,
  getEmbeddingModel: vi.fn(),
}));

vi.mock("@/features/auth-page/helpers", () => ({
  currentUserId: vi.fn(),
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-id",
}));

vi.mock("ai", () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));

import { DeleteDocumentsByFileNameInThread, DeleteDocumentsByUser } from "./azure-ai-search";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* asyncIterableOf<T>(items: T[]): AsyncGenerator<T, void, unknown> {
  for (const item of items) yield item;
}

describe("DeleteDocumentsByUser — GDPR erasure support (Art. 17)", () => {
  beforeEach(() => {
    searchMock.mockReset();
    deleteDocumentsMock.mockReset();
  });

  it("filters strictly by the `user` field (the same hashed id RAG retrieval scopes by), OData-escaped", async () => {
    searchMock.mockResolvedValue({ results: asyncIterableOf([]) });
    deleteDocumentsMock.mockResolvedValue({ results: [] });

    await DeleteDocumentsByUser("hash'with-quote");

    expect(searchMock).toHaveBeenCalledWith(undefined, {
      filter: "user eq 'hash''with-quote'",
    });
  });

  it("deletes every index document the filter matched, and reports one OK result per successful delete", async () => {
    searchMock.mockResolvedValue({
      results: asyncIterableOf([
        { score: 1, document: { id: "doc-1", user: "hash-1", chatThreadId: "t1", pageContent: "text", metadata: "file.pdf" } },
        { score: 1, document: { id: "doc-2", user: "hash-1", chatThreadId: "t2", pageContent: "text2", metadata: "file2.pdf" } },
      ]),
    });
    deleteDocumentsMock.mockResolvedValue({
      results: [{ succeeded: true }, { succeeded: true }],
    });

    const result = await DeleteDocumentsByUser("hash-1");

    expect(deleteDocumentsMock).toHaveBeenCalledWith([
      { id: "doc-1", user: "hash-1", chatThreadId: "t1", pageContent: "text", metadata: "file.pdf" },
      { id: "doc-2", user: "hash-1", chatThreadId: "t2", pageContent: "text2", metadata: "file2.pdf" },
    ]);
    expect(result).toEqual([
      { status: "OK", response: true },
      { status: "OK", response: true },
    ]);
  });

  it("surfaces a partial failure as an ERROR entry rather than silently under-counting", async () => {
    searchMock.mockResolvedValue({
      results: asyncIterableOf([
        { score: 1, document: { id: "doc-1", user: "hash-1", chatThreadId: "t1", pageContent: "text", metadata: "file.pdf" } },
      ]),
    });
    deleteDocumentsMock.mockResolvedValue({
      results: [{ succeeded: false, errorMessage: "throttled" }],
    });

    const result = await DeleteDocumentsByUser("hash-1");

    expect(result).toEqual([
      { status: "ERROR", errors: [{ message: "throttled" }] },
    ]);
  });
});

// W6 (`/documents`) — single-document removal, one level more granular than
// DeleteDocuments (whole thread) or DeleteDocumentsByUser (whole account).
describe("DeleteDocumentsByFileNameInThread — W6 single-document removal", () => {
  beforeEach(() => {
    searchMock.mockReset();
    deleteDocumentsMock.mockReset();
  });

  it("filters by BOTH chatThreadId and metadata (fileName), OData-escaped", async () => {
    searchMock.mockResolvedValue({ results: asyncIterableOf([]) });
    deleteDocumentsMock.mockResolvedValue({ results: [] });

    await DeleteDocumentsByFileNameInThread("thread-1", "O'Brien's notes.pdf");

    expect(searchMock).toHaveBeenCalledWith(undefined, {
      filter: "chatThreadId eq 'thread-1' and metadata eq 'O''Brien''s notes.pdf'",
    });
  });

  it("only deletes chunks matching that thread+fileName pair, never every chunk in the thread", async () => {
    searchMock.mockResolvedValue({
      results: asyncIterableOf([
        { score: 1, document: { id: "chunk-1", user: "u1", chatThreadId: "t1", pageContent: "a", metadata: "file.pdf" } },
        { score: 1, document: { id: "chunk-2", user: "u1", chatThreadId: "t1", pageContent: "b", metadata: "file.pdf" } },
      ]),
    });
    deleteDocumentsMock.mockResolvedValue({
      results: [{ succeeded: true }, { succeeded: true }],
    });

    const result = await DeleteDocumentsByFileNameInThread("t1", "file.pdf");

    expect(deleteDocumentsMock).toHaveBeenCalledWith([
      { id: "chunk-1", user: "u1", chatThreadId: "t1", pageContent: "a", metadata: "file.pdf" },
      { id: "chunk-2", user: "u1", chatThreadId: "t1", pageContent: "b", metadata: "file.pdf" },
    ]);
    expect(result).toEqual([
      { status: "OK", response: true },
      { status: "OK", response: true },
    ]);
  });

  it("surfaces a partial failure as an ERROR entry rather than silently under-counting", async () => {
    searchMock.mockResolvedValue({
      results: asyncIterableOf([
        { score: 1, document: { id: "chunk-1", user: "u1", chatThreadId: "t1", pageContent: "a", metadata: "file.pdf" } },
      ]),
    });
    deleteDocumentsMock.mockResolvedValue({
      results: [{ succeeded: false, errorMessage: "throttled" }],
    });

    const result = await DeleteDocumentsByFileNameInThread("t1", "file.pdf");

    expect(result).toEqual([{ status: "ERROR", errors: [{ message: "throttled" }] }]);
  });
});
