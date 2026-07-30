"use server";
import "server-only";

import { userHashedId } from "@/features/auth-page/helpers";
import { ServerActionResponse } from "@/features/common/server-action-response";
import {
  AzureAISearchIndexClientInstance,
  AzureAISearchInstance,
} from "@/features/common/services/ai-search";
import {
  AZURE_OPENAI_EMBEDDING_DIMENSIONS,
  getEmbeddingModel,
} from "@/features/common/services/azure-ai";
import { uniqueId } from "@/features/common/util";
import { SearchIndex } from "@azure/search-documents";
import { embed, embedMany } from "ai";

const debug = process.env.DEBUG === "true";

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
    if (debug) console.log("Executing SimpleSearch with searchText:", searchText, "filter:", filter);
    const instance = AzureAISearchInstance<AzureSearchDocumentIndex>();
    const searchResults = await instance.search(searchText, { filter: filter });

    const results: Array<DocumentSearchResponse> = [];
    for await (const result of searchResults.results) {
      results.push({
        score: result.score,
        document: result.document,
      });
    }

    if (debug) console.log("SimpleSearch results:", results);
    return {
      status: "OK",
      response: results,
    };
  } catch (e) {
    console.error("SimpleSearch error:", e);
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
    if (debug) console.log("Executing SimilaritySearch with searchText:", searchText, "k:", k, "filter:", filter);
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: searchText,
    });

    if (debug) console.log("Embedding obtained, dimensions:", embedding.length);

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

    if (debug) console.log("SimilaritySearch results:", results);
    return {
      status: "OK",
      response: results,
    };
  } catch (e) {
    console.error("SimilaritySearch error:", e);
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
    if (debug) console.log("Indexing documents with fileName:", fileName, "chatThreadId:", chatThreadId);
    const documentsToIndex: AzureSearchDocumentIndex[] = [];

    for (const doc of docs) {
      const docToAdd: AzureSearchDocumentIndex = {
        id: uniqueId(),
        chatThreadId,
        user: await userHashedId(),
        pageContent: doc,
        metadata: fileName,
        embedding: [],
      };

      documentsToIndex.push(docToAdd);
    }

    if (debug) console.log("Documents to index:", documentsToIndex);

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

      if (debug) console.log("IndexDocuments response:", response);
      return response;
    }

    return [embeddingsResponse];
  } catch (e) {
    console.error("IndexDocuments error:", e);
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
    if (debug) console.log("Deleting documents for chatThreadId:", chatThreadId);
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

      if (debug) console.log("DeleteDocuments response:", response);
      return response;
    }

    return [documentsInChatResponse];
  } catch (e) {
    console.error("DeleteDocuments error:", e);
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
    if (debug) console.log("Embedding documents:", documents.map((d) => d.id));
    const contentsToEmbed = documents.map((d) => d.pageContent);

    const { embeddings } = await embedMany({
      model: getEmbeddingModel(),
      values: contentsToEmbed,
    });

    if (debug) console.log(`Embeddings received: ${embeddings.length}`);

    embeddings.forEach((embedding, index) => {
      documents[index].embedding = embedding;
    });

    if (debug) console.log("Documents after embedding:", documents);
    return {
      status: "OK",
      response: documents,
    };
  } catch (e) {
    console.error("EmbedDocuments error:", e);
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
    console.log("Ensuring index is created: ", process.env.AZURE_SEARCH_INDEX_NAME);
    const client = AzureAISearchIndexClientInstance();
    const result = await client.getIndex(process.env.AZURE_SEARCH_INDEX_NAME);
    console.log("Index exists: ", result);
    return {
      status: "OK",
      response: result,
    };
  } catch (e) {
    console.log(`Error Creating index:${e}`);
    return await CreateSearchIndex();
  }
};

const CreateSearchIndex = async (): Promise<
  ServerActionResponse<SearchIndex>
> => {
  try {
    console.log("Creating search index");
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

    console.log("Search index created:", result);
    return {
      status: "OK",
      response: result,
    };
  } catch (e) {
    console.error("CreateSearchIndex error:", e);
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
