import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { SimilaritySearch } from "./azure-ai-search/azure-ai-search";
import { CreateCitations, FormatCitations } from "./citation-service";
import { buildDocumentSearchFilter } from "./chat-message-mapper";
import { ChatCitationModel } from "./models";

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 10;

/**
 * "chat with your files" retrieval as an AI SDK v6 tool.
 *
 * Authorization boundary: results are restricted to documents uploaded by
 * `userId` inside `chatThreadId` via `buildDocumentSearchFilter` — identical
 * OData filter to the pre-migration `ChatApiRAG` implementation. This MUST
 * NOT be widened (no cross-thread, no cross-user, no cross-tenant access —
 * each customer already has a dedicated AI Search resource/index).
 */
export const createSearchDocumentsTool = (props: {
  userId: string;
  chatThreadId: string;
}) => {
  const { userId, chatThreadId } = props;
  const filter = buildDocumentSearchFilter(userId, chatThreadId);

  return tool({
    description:
      "Search the documents the current user uploaded to this chat thread. " +
      "Always call this before answering any question that could be about an uploaded document. " +
      "Cite every fact you use from the results with the returned `id` using the format: " +
      '{% citation items=[{name:"filename",id:"file id"}] /%}',
    inputSchema: z.object({
      query: z.string().describe("The search query, derived from the user's question"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(MAX_TOP_K)
        .optional()
        .describe(`Number of chunks to retrieve (default ${DEFAULT_TOP_K}, max ${MAX_TOP_K})`),
    }),
    execute: async ({ query, topK }) => {
      const documentResponse = await SimilaritySearch(
        query,
        topK ?? DEFAULT_TOP_K,
        filter
      );

      if (documentResponse.status !== "OK") {
        return {
          results: [],
          error: documentResponse.errors.map((e) => e.message).join("; "),
        };
      }

      const withoutEmbedding = FormatCitations(documentResponse.response);
      const citationResponses = await CreateCitations(withoutEmbedding, userId);

      const citations: ChatCitationModel[] = [];
      citationResponses.forEach((c) => {
        if (c.status === "OK") {
          citations.push(c.response);
        }
      });

      return {
        results: citations.map((citation) => ({
          id: citation.id,
          fileName: citation.content.document.metadata,
          content: citation.content.document.pageContent,
        })),
      };
    },
  });
};
