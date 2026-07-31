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
  userHashedId: vi.fn(),
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-id",
}));

vi.mock("ai", () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));

import { DeleteDocumentsByUser } from "./azure-ai-search";

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
