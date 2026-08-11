"use server";
import "server-only";

import { RecordUploadEvent } from "@/features/admin/activity-service";
import { currentUserId } from "@/features/auth-page/helpers";
import { HistoryContainer } from "@/features/common/services/cosmos";

import { RevalidateCache } from "@/features/common/navigation-helpers";
import { ServerActionResponse } from "@/features/common/server-action-response";
import { safeLog } from "@/features/common/services/safe-logger";
import { DocumentIntelligenceInstance } from "@/features/common/services/document-intelligence";
import { uniqueId } from "@/features/common/util";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  DeleteDocumentsByFileNameInThread,
  EnsureIndexIsCreated,
} from "./azure-ai-search/azure-ai-search";
import {
  CHAT_DOCUMENT_ATTRIBUTE,
  CHAT_THREAD_ATTRIBUTE,
  ChatDocumentModel,
} from "./models";

const MAX_UPLOAD_DOCUMENT_SIZE: number = 20000000;
const CHUNK_SIZE = 2300;
const CHUNK_OVERLAP = CHUNK_SIZE * 0.25;

/** Azure SDK errors (RestError et al.) commonly carry a `statusCode` — never the message/stack. */
const statusCodeOf = (e: unknown): number | undefined =>
  (e as { statusCode?: number })?.statusCode;

export const CrackDocument = async (
  formData: FormData
): Promise<ServerActionResponse<string[]>> => {
  try {
    const response = await EnsureIndexIsCreated();
    if (response.status === "OK") {
      const fileResponse = await LoadFile(formData);
      if (fileResponse.status === "OK") {
        const splitDocuments = await ChunkDocumentWithOverlap(
          fileResponse.response.join("\n")
        );

        return {
          status: "OK",
          response: splitDocuments,
        };
      }

      safeLog.error("document.crack-file-load-failed");
      return fileResponse;
    }

    safeLog.error("document.crack-index-creation-failed");
    return response;
  } catch (e) {
    safeLog.error("document.crack-failed", { statusCode: statusCodeOf(e) });
    return {
      status: "ERROR",
      errors: [
        {
          message: `${e}`,
        },
      ],
    };
  }
};

const LoadFile = async (
  formData: FormData
): Promise<ServerActionResponse<string[]>> => {
  try {
    const file: File | null = formData.get("file") as unknown as File;

    const fileSize = process.env.MAX_UPLOAD_DOCUMENT_SIZE
      ? Number(process.env.MAX_UPLOAD_DOCUMENT_SIZE)
      : MAX_UPLOAD_DOCUMENT_SIZE;

    if (file && file.size < fileSize) {
      const client = DocumentIntelligenceInstance();

      const blob = new Blob([file], { type: file.type });

      const poller = await client.beginAnalyzeDocument(
        "prebuilt-read",
        await blob.arrayBuffer()
      );
      const { paragraphs } = await poller.pollUntilDone();

      const docs: Array<string> = [];

      if (paragraphs) {
        for (const paragraph of paragraphs) {
          docs.push(paragraph.content);
        }
      }

      return {
        status: "OK",
        response: docs,
      };
    } else {
      safeLog.warn("document.load-file-too-large");
      return {
        status: "ERROR",
        errors: [
          {
            message: `File is too large and must be less than ${MAX_UPLOAD_DOCUMENT_SIZE} bytes.`,
          },
        ],
      };
    }
  } catch (e) {
    safeLog.error("document.load-file-failed", { statusCode: statusCodeOf(e) });
    return {
      status: "ERROR",
      errors: [
        {
          message: `${e}`,
        },
      ],
    };
  }
};

export const FindAllChatDocuments = async (
  chatThreadID: string
): Promise<ServerActionResponse<ChatDocumentModel[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.chatThreadId = @threadId AND r.isDeleted=@isDeleted",
      parameters: [
        {
          name: "@type",
          value: CHAT_DOCUMENT_ATTRIBUTE,
        },
        {
          name: "@threadId",
          value: chatThreadID,
        },
        {
          name: "@isDeleted",
          value: false,
        },
      ],
    };

    const { resources } = await HistoryContainer()
      .items.query<ChatDocumentModel>(querySpec)
      .fetchAll();

    if (resources) {
      return {
        status: "OK",
        response: resources,
      };
    } else {
      safeLog.warn("document.find-all-chat-documents-empty");
      return {
        status: "ERROR",
        errors: [
          {
            message: "No documents found",
          },
        ],
      };
    }
  } catch (e) {
    safeLog.error("document.find-all-chat-documents-failed", { statusCode: statusCodeOf(e) });
    return {
      status: "ERROR",
      errors: [
        {
          message: `${e}`,
        },
      ],
    };
  }
};

/**
 * W6 (`/documents`) — every non-deleted document the CURRENT user has ever
 * uploaded, across all of their chat threads (not scoped to a single
 * `chatThreadId` like `FindAllChatDocuments`). Ownership filter is identical
 * to every other per-user accessor in this codebase: `r.userId=@userId`,
 * where `userId` on `ChatDocumentModel` is set from `currentUserId()` at
 * upload time (see `CreateChatDocument` above) — never a client-supplied
 * value, so this cannot be widened into a cross-user listing.
 */
export const FindAllChatDocumentsForCurrentUser = async (): Promise<
  ServerActionResponse<ChatDocumentModel[]>
> => {
  try {
    const userId = await currentUserId();
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.userId=@userId AND r.isDeleted=@isDeleted ORDER BY r.createdAt DESC",
      parameters: [
        { name: "@type", value: CHAT_DOCUMENT_ATTRIBUTE },
        { name: "@userId", value: userId },
        { name: "@isDeleted", value: false },
      ],
    };

    const { resources } = await HistoryContainer()
      .items.query<ChatDocumentModel>(querySpec)
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (e) {
    safeLog.error("document.find-all-for-current-user-failed", { statusCode: statusCodeOf(e) });
    return { status: "ERROR", errors: [{ message: `${e}` }] };
  }
};

/**
 * W6 (`/documents`) — removes a single uploaded document: soft-deletes its
 * `ChatDocumentModel` record (same `isDeleted` convention as
 * `SoftDeleteChatThreadForCurrentUser`) AND purges its chunks from the AI
 * Search index (`DeleteDocumentsByFileNameInThread`), so it stops being
 * retrievable by the RAG tool immediately — not just hidden from this list.
 * Re-verifies `r.userId === callerId` server-side before doing either;
 * never trusts a client-supplied document id's ownership.
 */
/**
 * Does `chatThreadId` belong to `userId`?
 *
 * Exists because `DeleteDocumentsByFileNameInThread` deletes AI Search chunks
 * by `chatThreadId + fileName` with NO `user` clause in its OData filter — its
 * own doc comment states callers MUST have verified ownership first. That
 * contract was being asserted rather than enforced.
 *
 * Deliberately a local query rather than an import of
 * `FindChatThreadForCurrentUser`: `chat-thread-service.ts` already imports
 * `FindAllChatDocuments` from THIS module, so importing back would create a
 * cycle between two `"use server"` modules.
 */
const callerOwnsThread = async (
  chatThreadId: string,
  userId: string
): Promise<boolean> => {
  const querySpec: SqlQuerySpec = {
    query:
      "SELECT VALUE COUNT(1) FROM root r WHERE r.type=@type AND r.id=@id AND r.userId=@userId AND r.isDeleted=@isDeleted",
    parameters: [
      { name: "@type", value: CHAT_THREAD_ATTRIBUTE },
      { name: "@id", value: chatThreadId },
      { name: "@userId", value: userId },
      { name: "@isDeleted", value: false },
    ],
  };

  const { resources } = await HistoryContainer()
    .items.query<number>(querySpec)
    .fetchAll();

  return (resources[0] ?? 0) > 0;
};

export const RemoveChatDocument = async (
  documentId: string
): Promise<ServerActionResponse<boolean>> => {
  try {
    const userId = await currentUserId();
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.id=@id AND r.userId=@userId AND r.isDeleted=@isDeleted",
      parameters: [
        { name: "@type", value: CHAT_DOCUMENT_ATTRIBUTE },
        { name: "@id", value: documentId },
        { name: "@userId", value: userId },
        { name: "@isDeleted", value: false },
      ],
    };

    const { resources } = await HistoryContainer()
      .items.query<ChatDocumentModel>(querySpec)
      .fetchAll();

    const document = resources[0];
    if (!document) {
      return { status: "NOT_FOUND", errors: [{ message: "Document not found." }] };
    }

    // SR-011: the `r.userId === callerId` check above proves the caller owns
    // this DOCUMENT ROW — which is not the same as owning the THREAD the row
    // points at, and the AI Search delete below is scoped by thread, not by
    // user. Without this second check an attacker could call
    // `CreateChatDocument(victimFileName, victimThreadId)` to mint a row they
    // legitimately own that points at someone else's thread, then delete it
    // and take the victim's indexed RAG chunks with it.
    if (!(await callerOwnsThread(document.chatThreadId, userId))) {
      return {
        status: "UNAUTHORIZED",
        errors: [{ message: "Document does not belong to a thread you own." }],
      };
    }

    await HistoryContainer().items.upsert<ChatDocumentModel>({ ...document, isDeleted: true });

    await DeleteDocumentsByFileNameInThread(document.chatThreadId, document.name);

    RevalidateCache({ page: "chat", params: document.chatThreadId });

    return { status: "OK", response: true };
  } catch (e) {
    safeLog.error("document.remove-chat-document-failed", { statusCode: statusCodeOf(e) });
    return { status: "ERROR", errors: [{ message: `${e}` }] };
  }
};

export const CreateChatDocument = async (
  fileName: string,
  chatThreadID: string
): Promise<ServerActionResponse<ChatDocumentModel>> => {
  try {
    const userId = await currentUserId();

    // SR-011: `chatThreadID` is a client-supplied argument. This module carries
    // the `"use server"` pragma, so every export here is an individually
    // POST-able Server Action — being imported by an authenticated page grants
    // no protection, and the uploader sources this value from React state that
    // the client controls anyway. Setting `userId` from the session is not
    // enough on its own: the row would be legitimately owned by the caller
    // while pointing at another user's thread, which is exactly the primitive
    // the deletion path in `RemoveChatDocument` can be turned against.
    if (!(await callerOwnsThread(chatThreadID, userId))) {
      return {
        status: "UNAUTHORIZED",
        errors: [{ message: "You do not own this conversation." }],
      };
    }

    const modelToSave: ChatDocumentModel = {
      chatThreadId: chatThreadID,
      id: uniqueId(),
      userId,
      createdAt: new Date(),
      type: CHAT_DOCUMENT_ATTRIBUTE,
      isDeleted: false,
      name: fileName,
    };

    const { resource } = await HistoryContainer().items.upsert<ChatDocumentModel>(modelToSave);
    RevalidateCache({
      page: "chat",
      params: chatThreadID,
    });

    if (resource) {
      // SAD §8.6 activity tracking — best-effort, count-only (no filename).
      const tenantSlug = await getCurrentTenantSlug();
      await RecordUploadEvent({ tenantSlug, actorId: modelToSave.userId });

      return {
        status: "OK",
        response: resource,
      };
    }

    safeLog.error("document.create-chat-document-save-failed");
    return {
      status: "ERROR",
      errors: [
        {
          message: "Unable to save chat document",
        },
      ],
    };
  } catch (e) {
    safeLog.error("document.create-chat-document-failed", { statusCode: statusCodeOf(e) });
    return {
      status: "ERROR",
      errors: [
        {
          message: `${e}`,
        },
      ],
    };
  }
};

export async function ChunkDocumentWithOverlap(
  document: string
): Promise<string[]> {
  const chunks: string[] = [];

  if (document.length <= CHUNK_SIZE) {
    chunks.push(document);
    return chunks;
  }

  let startIndex = 0;

  while (startIndex < document.length) {
    const endIndex = startIndex + CHUNK_SIZE;
    const chunk = document.substring(startIndex, endIndex);
    chunks.push(chunk);
    startIndex = endIndex - CHUNK_OVERLAP;
  }

  return chunks;
}
