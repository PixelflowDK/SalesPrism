"use server";
import "server-only";

import { currentUserId } from "@/features/auth-page/helpers";
import { ServerActionResponse } from "@/features/common/server-action-response";
import {
  AzureAISearchIndexClientInstance,
  AzureAISearchInstance,
} from "@/features/common/services/ai-search";
import {
  AZURE_OPENAI_EMBEDDING_DIMENSIONS,
  getEmbeddingModel,
} from "@/features/common/services/azure-ai";
import { safeLog } from "@/features/common/services/safe-logger";
import { uniqueId } from "@/features/common/util";
import { SearchIndex } from "@azure/search-documents";
import { embed, embedMany } from "ai";

/** Azure SDK errors (RestError et al.) commonly carry a `statusCode` — never the message/stack. */
const statusCodeOf = (e: unknown): number | undefined =>
  (e as { statusCode?: number })?.statusCode;

export interface AzureSearchDocumentIndex {
  id: string;
  pageContent: string;
  embedding?: number[];
  user: string;
  chatThreadId: string;
  metadata: string;
}

export type DocumentSearchResponse = {
  score: number;
  document: AzureSearchDocumentIndex;
};

export const SimpleSearch = async (
  searchText?: string,
  filter?: string
): Promise<ServerActionResponse<Array<DocumentSearchResponse>>> => {
  try {
    const instance = AzureAISearchInstance<AzureSearchDocumentIndex>();
    const searchResults = await instance.search(searchText, { filter: filter });

    const results: Array<DocumentSearchResponse> = [];
    for await (const result of searchResults.results) {
      results.push({
        score: result.score,
        document: result.document,
      });
    }

    return {
      status: "OK",
      response: results,
    };
  } catch (e) {
    safeLog.error("search.simple-search-failed", { statusCode: statusCodeOf(e) });
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

export const SimilaritySearch = async (
  searchText: string,
  k: number,
  filter?: string
): Promise<ServerActionResponse<Array<DocumentSearchResponse>>> => {
  try {
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: searchText,
    });

    const searchClient = AzureAISearchInstance<AzureSearchDocumentIndex>();
    const searchResults = await searchClient.search(searchText, {
      top: k,
      filter: filter,
      vectorSearchOptions: {
        queries: [
          {
            vector: embedding,
            fields: ["embedding"],
            kind: "vector",
            kNearestNeighborsCount: 10,
          },
        ],
      },
    });

    const results: Array<DocumentSearchResponse> = [];
    for await (const result of searchResults.results) {
      results.push({
        score: result.score,
        document: result.document,
      });
    }

    return {
      status: "OK",
      response: results,
    };
  } catch (e) {
    safeLog.error("search.similarity-search-failed", { statusCode: statusCodeOf(e) });
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

// NOTE: `ExtensionSimilaritySearch` (per-request AzureKeyCredential search against an
// extension-supplied index) was removed here. It was dead code once
// `chat-services/chat-api/*` (the dynamic extensions plugin system, including
// `/api/document`'s proxy route) was deleted — extension execution is deferred to
// SAD §18 Phase C Sprint 3. Its API-key-credential pattern would also have conflicted
// with the zero-secrets / DefaultAzureCredential-only mandate.

export const IndexDocuments = async (
  fileName: string,
  docs: string[],
  chatThreadId: string
): Promise<Array<ServerActionResponse<boolean>>> => {
  try {
    const documentsToIndex: AzureSearchDocumentIndex[] = [];

    for (const doc of docs) {
      const docToAdd: AzureSearchDocumentIndex = {
        id: uniqueId(),
        chatThreadId,
        user: await currentUserId(),
        pageContent: doc,
        metadata: fileName,
        embedding: [],
      };

      documentsToIndex.push(docToAdd);
    }

    const instance = AzureAISearchInstance();
    const embeddingsResponse = await EmbedDocuments(documentsToIndex);

    if (embeddingsResponse.status === "OK") {
      const uploadResponse = await instance.uploadDocuments(
        embeddingsResponse.response
      );

      const response: Array<ServerActionResponse<boolean>> = [];
      uploadResponse.results.forEach((r) => {
        if (r.succeeded) {
          response.push({
            status: "OK",
            response: r.succeeded,
          });
        } else {
          response.push({
            status: "ERROR",
            errors: [
              {
                message: `${r.errorMessage}`,
              },
            ],
          });
        }
      });

      return response;
    }

    return [embeddingsResponse];
  } catch (e) {
    safeLog.error("search.index-documents-failed", { statusCode: statusCodeOf(e) });
    return [
      {
        status: "ERROR",
        errors: [
          {
            message: `${e}`,
          },
        ],
      },
    ];
  }
};

export const DeleteDocuments = async (
  chatThreadId: string
): Promise<Array<ServerActionResponse<boolean>>> => {
  try {
    const documentsInChatResponse = await SimpleSearch(
      undefined,
      `chatThreadId eq '${chatThreadId}'`
    );

    if (documentsInChatResponse.status === "OK") {
      const instance = AzureAISearchInstance();
      const deletedResponse = await instance.deleteDocuments(
        documentsInChatResponse.response.map((r) => r.document)
      );

      const response: Array<ServerActionResponse<boolean>> = [];
      deletedResponse.results.forEach((r) => {
        if (r.succeeded) {
          response.push({
            status: "OK",
            response: r.succeeded,
          });
        } else {
          response.push({
            status: "ERROR",
            errors: [
              {
                message: `${r.errorMessage}`,
              },
            ],
          });
        }
      });

      return response;
    }

    return [documentsInChatResponse];
  } catch (e) {
    safeLog.error("search.delete-documents-failed", { statusCode: statusCodeOf(e) });
    return [
      {
        status: "ERROR",
        errors: [
          {
            message: `${e}`,
          },
        ],
      },
    ];
  }
};

/** OData string-literal escape — mirrors `chat-message-mapper.ts`'s `escapeODataLiteral`. Never interpolate a raw value into a `filter` string without this. */
const escapeODataLiteral = (value: string): string => value.replace(/'/g, "''");

/**
 * W6 (`/documents`) — single-document removal, one level more granular than
 * `DeleteDocuments` (which purges an entire thread). A single uploaded file
 * is indexed as multiple chunks that all share `chatThreadId` + `metadata`
 * (the original file name — see `IndexDocuments`), so that pair is the
 * document's identity within the index. Callers MUST have already verified
 * the caller owns `chatThreadId` (see `chat-document-service.ts`'s
 * `RemoveChatDocument`) — this function does not re-check ownership itself,
 * same division of responsibility as `DeleteDocuments`.
 */
export const DeleteDocumentsByFileNameInThread = async (
  chatThreadId: string,
  fileName: string
): Promise<Array<ServerActionResponse<boolean>>> => {
  try {
    const filter = `chatThreadId eq '${escapeODataLiteral(chatThreadId)}' and metadata eq '${escapeODataLiteral(
      fileName
    )}'`;
    const matchingDocumentsResponse = await SimpleSearch(undefined, filter);

    if (matchingDocumentsResponse.status === "OK") {
      const instance = AzureAISearchInstance();
      const deletedResponse = await instance.deleteDocuments(
        matchingDocumentsResponse.response.map((r) => r.document)
      );

      const response: Array<ServerActionResponse<boolean>> = [];
      deletedResponse.results.forEach((r) => {
        if (r.succeeded) {
          response.push({ status: "OK", response: r.succeeded });
        } else {
          response.push({ status: "ERROR", errors: [{ message: `${r.errorMessage}` }] });
        }
      });
      return response;
    }

    return [matchingDocumentsResponse];
  } catch (e) {
    safeLog.error("search.delete-documents-by-filename-failed", { statusCode: statusCodeOf(e) });
    return [{ status: "ERROR", errors: [{ message: `${e}` }] }];
  }
};

/**
 * GDPR erasure (Art. 17) support — deletes every AI Search index document
 * whose `user` field (the same SHA-256 hashed id `rag-tool.ts`'s
 * `buildDocumentSearchFilter` scopes retrieval by) matches `userId`, across
 * every chat thread that user has ever uploaded documents to.
 *
 * The index is a derivative store of the uploaded documents, not an
 * anonymized one: `pageContent` holds the full extracted document text and
 * `user`/`chatThreadId` hold the same identifiers used for RAG access
 * control, in the SAME index document as the `embedding` vector — so
 * deleting this document removes text, identity tag, and vector together.
 * There is no separate embedding-only store left behind afterward.
 */
export const DeleteDocumentsByUser = async (
  userId: string
): Promise<Array<ServerActionResponse<boolean>>> => {
  try {
    const documentsForUserResponse = await SimpleSearch(
      undefined,
      `user eq '${escapeODataLiteral(userId)}'`
    );

    if (documentsForUserResponse.status === "OK") {
      const instance = AzureAISearchInstance();
      const deletedResponse = await instance.deleteDocuments(
        documentsForUserResponse.response.map((r) => r.document)
      );

      const response: Array<ServerActionResponse<boolean>> = [];
      deletedResponse.results.forEach((r) => {
        if (r.succeeded) {
          response.push({
            status: "OK",
            response: r.succeeded,
          });
        } else {
          response.push({
            status: "ERROR",
            errors: [
              {
                message: `${r.errorMessage}`,
              },
            ],
          });
        }
      });

      return response;
    }

    return [documentsForUserResponse];
  } catch (e) {
    safeLog.error("search.delete-documents-by-user-failed", { statusCode: statusCodeOf(e) });
    return [
      {
        status: "ERROR",
        errors: [
          {
            message: `${e}`,
          },
        ],
      },
    ];
  }
};

export const EmbedDocuments = async (
  documents: Array<AzureSearchDocumentIndex>
): Promise<ServerActionResponse<Array<AzureSearchDocumentIndex>>> => {
  try {
    const contentsToEmbed = documents.map((d) => d.pageContent);

    const { embeddings } = await embedMany({
      model: getEmbeddingModel(),
      values: contentsToEmbed,
    });

    embeddings.forEach((embedding, index) => {
      documents[index].embedding = embedding;
    });

    return {
      status: "OK",
      response: documents,
    };
  } catch (e) {
    safeLog.error("search.embed-documents-failed", { statusCode: statusCodeOf(e) });
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

export const EnsureIndexIsCreated = async (): Promise<
  ServerActionResponse<SearchIndex>
> => {
  try {
    safeLog.info("search.index-ensure-started");
    const client = AzureAISearchIndexClientInstance();
    const result = await client.getIndex(process.env.AZURE_SEARCH_INDEX_NAME);
    safeLog.info("search.index-already-exists");
    return {
      status: "OK",
      response: result,
    };
  } catch (e) {
    safeLog.warn("search.index-not-found-creating", { statusCode: statusCodeOf(e) });
    return await CreateSearchIndex();
  }
};

const CreateSearchIndex = async (): Promise<
  ServerActionResponse<SearchIndex>
> => {
  try {
    safeLog.info("search.index-create-started");
    const client = AzureAISearchIndexClientInstance();
    const result = await client.createIndex({
      name: process.env.AZURE_SEARCH_INDEX_NAME,
      vectorSearch: {
        algorithms: [
          {
            name: "hnsw-vector",
            kind: "hnsw",
            parameters: {
              m: 4,
              efConstruction: 200,
              efSearch: 200,
              metric: "cosine",
            },
          },
        ],
        profiles: [
          {
            name: "hnsw-vector",
            algorithmConfigurationName: "hnsw-vector",
          },
        ],
      },

      fields: [
        {
          name: "id",
          type: "Edm.String",
          key: true,
          filterable: true,
        },
        {
          name: "user",
          type: "Edm.String",
          searchable: true,
          filterable: true,
        },
        {
          name: "chatThreadId",
          type: "Edm.String",
          searchable: true,
          filterable: true,
        },
        {
          name: "pageContent",
          searchable: true,
          type: "Edm.String",
        },
        {
          name: "metadata",
          type: "Edm.String",
        },
        {
          name: "embedding",
          type: "Collection(Edm.Single)",
          searchable: true,
          filterable: false,
          sortable: false,
          facetable: false,
          vectorSearchDimensions: AZURE_OPENAI_EMBEDDING_DIMENSIONS,
          vectorSearchProfileName: "hnsw-vector",
        },
      ],
    });

    safeLog.info("search.index-create-succeeded");
    return {
      status: "OK",
      response: result,
    };
  } catch (e) {
    safeLog.error("search.index-create-failed", { statusCode: statusCodeOf(e) });
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
