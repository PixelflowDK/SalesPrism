import type { ModelMessage } from "ai";
import { ChatMessageModel } from "./models";

/**
 * Pure mapping from Cosmos DB chat history to AI SDK v6 `ModelMessage[]`.
 *
 * Historical "function"/"tool" role messages (produced by the pre-migration
 * azurechat extensions/DALL-E plugin system) are intentionally dropped from
 * the model context — extension execution is deferred (SAD §18 Phase C,
 * Sprint 3). They remain visible in Cosmos DB and still render in the chat
 * transcript UI (`message-content.tsx`) for history continuity, but are no
 * longer replayed back into the model as tool-call/tool-result turns.
 */
export const mapChatMessagesToModelMessages = (
  messages: ChatMessageModel[]
): ModelMessage[] => {
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      modelMessages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      modelMessages.push({ role: "assistant", content: message.content });
    }
    // "system" is handled separately via the `system` prompt parameter.
    // "function" / "tool" are dropped — see doc-comment above.
  }

  return modelMessages;
};

/**
 * OData filter restricting Azure AI Search results to documents uploaded by
 * this exact user, in this exact chat thread. This is the sole authorization
 * boundary for "chat with your files" retrieval — it MUST NOT be widened.
 * Preserved byte-for-byte from the pre-migration `ChatApiRAG` implementation.
 */
export const buildDocumentSearchFilter = (
  userId: string,
  chatThreadId: string
): string => `user eq '${userId}' and chatThreadId eq '${chatThreadId}'`;

const HALLUCINATION_GUARDRAIL = `
When you use the searchDocuments tool, you must answer ONLY from the content it returns.
If the retrieved content is insufficient to answer the question, say so plainly instead of guessing or using outside knowledge.
Always include a citation at the end of your answer for any claim sourced from a document, and do not include a full stop after the citation block.
Use exactly this citation format: {% citation items=[{name:"filename 1",id:"file id"}, {name:"filename 2",id:"file id"}] /%}`;

/**
 * Builds the final system prompt for a chat turn: platform default prompt +
 * thread persona message, with hallucination-prevention / citation-format
 * instructions appended only when the searchDocuments tool is available for
 * this turn (i.e. the thread has at least one uploaded document).
 */
export const buildSystemPrompt = (
  basePrompt: string,
  personaMessage: string,
  ragToolAvailable: boolean
): string => {
  const persona = `${basePrompt} \n\n ${personaMessage}`;
  return ragToolAvailable ? `${persona}\n${HALLUCINATION_GUARDRAIL}` : persona;
};
