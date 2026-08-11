"use server";
import "server-only";

import { RecordUploadEvent } from "@/features/admin/activity-service";
import { currentUserId } from "@/features/auth-page/helpers";
import { HistoryContainer } from "@/features/common/services/cosmos";

import { RevalidateCache } from "@/features/common/navigation-helpers";
import { ServerActionResponse } from "@/features/common/server-action-response";
import { DocumentIntelligenceInstance } from "@/features/common/services/document-intelligence";
import { uniqueId } from "@/features/common/util";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  DeleteDocumentsByFileNameInThread,
  EnsureIndexIsCreated,
} from "./azure-ai-search/azure-ai-search";
import { CHAT_DOCUMENT_ATTRIBUTE, ChatDocumentModel } from "./models";

const MAX_UPLOAD_DOCUMENT_SIZE: number = 20000000;
const CHUNK_SIZE = 2300;
const CHUNK_OVERLAP = CHUNK_SIZE * 0.25;

const debug = process.env.DEBUG === "true";

export const CrackDocument = async (
  formData: FormData
): Promise<ServerActionResponse<string[]>> => {
  try {
    if (debug) console.log("CrackDocument: Ensuring index is created.");
    const response = await EnsureIndexIsCreated();
    if (response.status === "OK") {
      if (debug) console.log("CrackDocument: Index is created, loading file.");
      const fileResponse = await LoadFile(formData);
      if (fileResponse.status === "OK") {
        if (debug) console.log("CrackDocument: File loaded successfully, splitting documents.");
        const splitDocuments = await ChunkDocumentWithOverlap(
          fileResponse.response.join("\n")
        );

        if (debug) console.log("CrackDocument: Documents split successfully.");
        return {
          status: "OK",
          response: splitDocuments,
        };
      }

      console.error("CrackDocument: File loading failed.", fileResponse.errors);
      return fileResponse;
    }

    console.error("CrackDocument: Index creation failed.", response.errors);
    return response;
  } catch (e) {
    console.error("CrackDocument error:", e);
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
    if (debug) console.log("LoadFile: Loading file from form data.");
    const file: File | null = formData.get("file") as unknown as File;

    const fileSize = process.env.MAX_UPLOAD_DOCUMENT_SIZE
      ? Number(process.env.MAX_UPLOAD_DOCUMENT_SIZE)
      : MAX_UPLOAD_DOCUMENT_SIZE;

    if (file && file.size < fileSize) {
      if (debug) console.log("LoadFile: File size is within the acceptable limit.");
      const client = DocumentIntelligenceInstance();

      const blob = new Blob([file], { type: file.type });

      if (debug) console.log("LoadFile: Beginning document analysis.");
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
        if (debug) console.log("LoadFile: Document analysis completed successfully.");
      }

      return {
        status: "OK",
        response: docs,
      };
    } else {
      console.error("LoadFile: File size is too large.");
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
    console.error("LoadFile error:", e);
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
    if (debug) console.log("FindAllChatDocuments: Searching documents for chatThreadID:", chatThreadID);
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
      if (debug) console.log(`FindAllChatDocuments: ${resources.length} Documents found.`);
      return {
        status: "OK",
        response: resources,
      };
    } else {
      console.error("FindAllChatDocuments: No documents found.");
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
    console.error("FindAllChatDocuments error:", e);
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
    console.error("FindAllChatDocumentsForCurrentUser error:", e);
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

    await HistoryContainer().items.upsert<ChatDocumentModel>({ ...document, isDeleted: true });

    await DeleteDocumentsByFileNameInThread(document.chatThreadId, document.name);

    RevalidateCache({ page: "chat", params: document.chatThreadId });

    return { status: "OK", response: true };
  } catch (e) {
    console.error("RemoveChatDocument error:", e);
    return { status: "ERROR", errors: [{ message: `${e}` }] };
  }
};

export const CreateChatDocument = async (
  fileName: string,
  chatThreadID: string
): Promise<ServerActionResponse<ChatDocumentModel>> => {
  try {
    if (debug) console.log("CreateChatDocument: Creating document with fileName:", fileName, "chatThreadID:", chatThreadID);
    const modelToSave: ChatDocumentModel = {
      chatThreadId: chatThreadID,
      id: uniqueId(),
      userId: await currentUserId(),
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
      if (debug) console.log("CreateChatDocument: Document created successfully.");

      // SAD §8.6 activity tracking — best-effort, count-only (no filename).
      const tenantSlug = await getCurrentTenantSlug();
      await RecordUploadEvent({ tenantSlug, actorId: modelToSave.userId });

      return {
        status: "OK",
        response: resource,
      };
    }

    console.error("CreateChatDocument: Unable to save chat document.");
    return {
      status: "ERROR",
      errors: [
        {
          message: "Unable to save chat document",
        },
      ],
    };
  } catch (e) {
    console.error("CreateChatDocument error:", e);
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
  if (debug) console.log("ChunkDocumentWithOverlap: Starting chunking process.");
  const chunks: string[] = [];

  if (document.length <= CHUNK_SIZE) {
    if (debug) console.log("ChunkDocumentWithOverlap: Document length is within single chunk size.");
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

  if (debug) console.log("ChunkDocumentWithOverlap: Chunking completed.", chunks);
  return chunks;
}
