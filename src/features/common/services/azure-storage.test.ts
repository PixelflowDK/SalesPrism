import { beforeEach, describe, expect, it, vi } from "vitest";

const listBlobsFlatMock = vi.fn();
const deleteIfExistsMock = vi.fn();
const getBlockBlobClientMock = vi.fn(() => ({ deleteIfExists: deleteIfExistsMock }));
const getContainerClientMock = vi.fn(() => ({
  listBlobsFlat: listBlobsFlatMock,
  getBlockBlobClient: getBlockBlobClientMock,
}));

class FakeRestError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

class FakeBlobServiceClient {
  getContainerClient = getContainerClientMock;
}

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: FakeBlobServiceClient,
  RestError: FakeRestError,
}));

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* asyncIterableOf<T>(items: T[]): AsyncGenerator<T, void, unknown> {
  for (const item of items) yield item;
}

/**
 * `azure-storage.ts` reads `USE_MANAGED_IDENTITIES`/`AZURE_STORAGE_ACCOUNT_NAME`
 * at module top-level, so the env vars must be set BEFORE the module first
 * evaluates. `vi.resetModules()` + a dynamic `import()` inside each test
 * (rather than a single static import) is the standard way to get a fresh
 * module evaluation per test with different env state.
 */
const loadModule = async () => {
  process.env.USE_MANAGED_IDENTITIES = "true";
  process.env.AZURE_STORAGE_ACCOUNT_NAME = "stexample";
  vi.resetModules();
  return await import("./azure-storage");
};

describe("DeleteBlobsWithPrefix — GDPR erasure support", () => {
  beforeEach(() => {
    listBlobsFlatMock.mockReset();
    deleteIfExistsMock.mockReset();
    getContainerClientMock.mockClear();
    getBlockBlobClientMock.mockClear();
  });

  it("deletes every blob under the given prefix and returns the confirmed-deleted count", async () => {
    listBlobsFlatMock.mockReturnValue(
      asyncIterableOf([{ name: "thread-1/a.png" }, { name: "thread-1/b.png" }])
    );
    deleteIfExistsMock.mockResolvedValue({ succeeded: true });

    const { DeleteBlobsWithPrefix } = await loadModule();
    const result = await DeleteBlobsWithPrefix("images", "thread-1/");

    expect(result).toEqual({ status: "OK", response: 2 });
    expect(listBlobsFlatMock).toHaveBeenCalledWith({ prefix: "thread-1/" });
    expect(getBlockBlobClientMock).toHaveBeenCalledWith("thread-1/a.png");
    expect(getBlockBlobClientMock).toHaveBeenCalledWith("thread-1/b.png");
  });

  it("only counts blobs actually confirmed deleted", async () => {
    listBlobsFlatMock.mockReturnValue(asyncIterableOf([{ name: "thread-1/a.png" }]));
    deleteIfExistsMock.mockResolvedValue({ succeeded: false });

    const { DeleteBlobsWithPrefix } = await loadModule();
    const result = await DeleteBlobsWithPrefix("images", "thread-1/");

    expect(result).toEqual({ status: "OK", response: 0 });
  });

  it("treats a missing container (404) as zero blobs, not an error", async () => {
    listBlobsFlatMock.mockImplementation(() => {
      throw new FakeRestError("container not found", 404);
    });

    const { DeleteBlobsWithPrefix } = await loadModule();
    const result = await DeleteBlobsWithPrefix("images", "thread-1/");

    expect(result).toEqual({ status: "OK", response: 0 });
  });

  it("surfaces a genuine failure as an ERROR result, not a silent zero", async () => {
    listBlobsFlatMock.mockImplementation(() => {
      throw new Error("network blip");
    });

    const { DeleteBlobsWithPrefix } = await loadModule();
    const result = await DeleteBlobsWithPrefix("images", "thread-1/");

    expect(result.status).toBe("ERROR");
  });
});
