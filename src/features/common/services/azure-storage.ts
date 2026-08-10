import { BlobServiceClient, RestError } from "@azure/storage-blob";
import { ServerActionResponse } from "../server-action-response";
import { DefaultAzureCredential } from "@azure/identity";

// Zero-secrets Azure Storage access (SAD §5.3, CLAUDE.md "Never Violated" list; SR-002/H-1).
// No Azure Storage account-key environment variable may ever be read here —
// DefaultAzureCredential (managed identity) only, matching azure-ai.ts / cosmos.ts.
const InitBlobServiceClient = () => {
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const endpointSuffix = process.env.AZURE_STORAGE_ENDPOINT_SUFFIX || "core.windows.net";

  if (!accountName) {
    throw new Error(
      "Azure Storage Account not configured correctly, check environment variables."
    );
  }

  const endpoint = `https://${accountName}.blob.${endpointSuffix}`;
  return new BlobServiceClient(endpoint, new DefaultAzureCredential());
};

export const UploadBlob = async (
  containerName: string,
  blobName: string,
  blobData: Buffer
): Promise<ServerActionResponse<string>> => {
  const blobServiceClient = InitBlobServiceClient();

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const response = await blockBlobClient.uploadData(blobData);

  // Check for upload success
  if (response.errorCode !== undefined) {
    return {
      status: "ERROR",
      errors: [
        {
          message: `Error uploading blob to storage: ${response.errorCode}`,
        },
      ],
    };
  }
  return {
    status: "OK",
    response: blockBlobClient.url,
  };
};

/**
 * GDPR erasure (Art. 17) support — deletes every blob whose name starts
 * with `prefix` (e.g. a chat-thread id, `"<threadId>/"`) from `containerName`.
 * Used by `gdpr-erasure-service.ts` to remove a data subject's chat-image
 * blobs; the "images" container keys blobs by `${threadId}/${fileName}`,
 * not by user id, so the caller must resolve the subject's thread ids first
 * (see `chat-image-service.ts`'s `GetBlobPath`).
 *
 * Best-effort per blob: one failed delete does not abort the batch, so a
 * transient error on one blob never leaves erasure silently incomplete for
 * the rest — the returned count only reflects blobs actually confirmed
 * deleted. A missing container (never uploaded to, or already emptied by
 * lifecycle management — see infra/modules/storage.bicep) is treated as
 * zero blobs to delete, not an error.
 */
export const DeleteBlobsWithPrefix = async (
  containerName: string,
  prefix: string
): Promise<ServerActionResponse<number>> => {
  const blobServiceClient = InitBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(containerName);

  try {
    let deleted = 0;
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const result = await containerClient
        .getBlockBlobClient(blob.name)
        .deleteIfExists();
      if (result.succeeded) {
        deleted++;
      }
    }
    return { status: "OK", response: deleted };
  } catch (error) {
    if (error instanceof RestError && error.statusCode === 404) {
      // Container doesn't exist (yet) — nothing to delete, not a failure.
      return { status: "OK", response: 0 };
    }
    return {
      status: "ERROR",
      errors: [
        {
          message: `Error deleting blobs with prefix: ${prefix}`,
        },
      ],
    };
  }
};

export const GetBlob = async (
  containerName: string,
  blobPath: string
): Promise<ServerActionResponse<ReadableStream<any>>> => {
  const blobServiceClient = InitBlobServiceClient();

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

  try {
    const downloadBlockBlobResponse = await blockBlobClient.download(0);

    // Passes stream to caller to decide what to do with
    if (!downloadBlockBlobResponse.readableStreamBody) {
      return {
        status: "ERROR",
        errors: [
          {
            message: `Error downloading blob: ${blobPath}`,
          },
        ],
      };
    }

    return {
      status: "OK",
      response:
        downloadBlockBlobResponse.readableStreamBody as unknown as ReadableStream<any>,
    };
  } catch (error) {
    if (error instanceof RestError) {
      const restError = error as RestError;
      if (restError.statusCode === 404) {
        return {
          status: "NOT_FOUND",
          errors: [
            {
              message: `Blob not found: ${blobPath}`,
            },
          ],
        };
      }
    }

    return {
      status: "ERROR",
      errors: [
        {
          message: `Error downloading blob: ${blobPath}`,
        },
      ],
    };
  }
};
