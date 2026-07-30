"use server";
import "server-only";

import { RecordPromptEvent } from "@/features/admin/activity-service";
import { getCurrentUser, userHashedId } from "@/features/auth-page/helpers";
import { getChatModel } from "@/features/common/services/azure-ai";
import { newRequestId, safeLog } from "@/features/common/services/safe-logger";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { CHAT_DEFAULT_SYSTEM_PROMPT, AI_NAME } from "@/features/theme/theme-config";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { buildSystemPrompt, mapChatMessagesToModelMessages } from "./chat-message-mapper";
import { FindAllChatDocuments } from "./chat-document-service";
import {
  CreateChatMessage,
  FindTopChatMessagesForCurrentUser,
} from "./chat-message-service";
import { createSearchDocumentsTool } from "./rag-tool";
import { EnsureChatThreadOperation } from "./chat-thread-service";
import { ChatThreadModel, UserPrompt } from "./models";

/**
 * Maximum tool-call round-trips per turn: 1 for the initial searchDocuments
 * call + follow-ups if the model wants to refine its query, + 1 final step
 * to produce the grounded answer. streamText defaults to stepCountIs(1),
 * which would stop right after a tool call and never generate the answer —
 * this override is required for the RAG tool to actually work.
 */
const MAX_TOOL_STEPS = 4;

/**
 * Server-side chat orchestrator (Vercel AI SDK v6 `streamText`), replacing
 * the pre-migration `ChatAPIEntry` / `ChatCompletionStreamingRunner` pipeline.
 *
 * Preserved from the original: persona/system prompt assembly, Cosmos DB
 * chat history (server-authoritative — the client never supplies history),
 * per-thread document RAG with identical authorization filtering, thread
 * title auto-update, and multimodal (image) chat.
 *
 * Deferred (SAD §18 Phase C, Sprint 3 — documented, not ported): the
 * extensions/plugins subsystem (default DALL-E image-creation extension and
 * dynamic per-tenant API extensions). Tool-call/tool-result chat messages
 * are therefore no longer produced or persisted.
 */
export const ChatAPIEntry = async (
  props: UserPrompt,
  signal: AbortSignal
): Promise<Response> => {
  const requestId = newRequestId();
  const currentChatThreadResponse = await EnsureChatThreadOperation(props.id);

  if (currentChatThreadResponse.status !== "OK") {
    return new Response("", { status: 401 });
  }

  const currentChatThread = currentChatThreadResponse.response;

  const [user, userId, tenantSlug, history, docs] = await Promise.all([
    getCurrentUser(),
    userHashedId(),
    getCurrentTenantSlug(),
    _getHistory(currentChatThread, requestId),
    _getDocuments(currentChatThread, requestId),
  ]);

  const ragToolAvailable = docs.length > 0;

  await CreateChatMessage({
    name: user.name,
    content: props.message,
    role: "user",
    chatThreadId: currentChatThread.id,
    multiModalImage: props.multimodalImage,
  });

  const system = buildSystemPrompt(
    CHAT_DEFAULT_SYSTEM_PROMPT,
    currentChatThread.personaMessage,
    ragToolAvailable
  );

  const messages: ModelMessage[] = [
    ...mapChatMessagesToModelMessages(history),
    _buildUserMessage(props),
  ];

  const result = streamText({
    model: getChatModel(),
    system,
    messages,
    abortSignal: signal,
    tools: ragToolAvailable
      ? { searchDocuments: createSearchDocumentsTool({ userId, chatThreadId: currentChatThread.id }) }
      : undefined,
    stopWhen: ragToolAvailable ? stepCountIs(MAX_TOOL_STEPS) : undefined,
    onFinish: async (event) => {
      // Thread title auto-update stays client-side (chat-store.tsx), invoked
      // directly against the `UpdateChatTitle` Server Action after the stream
      // completes — that is what makes Next.js auto-refresh the already
      // mounted chat-menu sidebar. Doing it here (inside a plain Route
      // Handler request, not a Server Action RPC) would persist the rename
      // but NOT refresh the client without an explicit `router.refresh()`.
      await CreateChatMessage({
        name: AI_NAME,
        content: event.text,
        role: "assistant",
        chatThreadId: currentChatThread.id,
      });

      // SAD §8.6 activity tracking — best-effort, never blocks the response.
      // Only counts/lengths/tokens are recorded, never prompt/response text.
      await RecordPromptEvent({
        tenantSlug,
        actorHashedId: userId,
        sessionId: currentChatThread.id,
        promptLength: props.message.length,
        tokensUsed: event.totalUsage.totalTokens,
        modelTier: process.env.PLATFORM_TIER || "smb",
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      // Codex review #1 finding 7 (MEDIUM) — never log the raw streamText
      // error object (routinely carries prompt text / retrieved content).
      // `requestId` is the only correlation surfaced to both the log line
      // and the user-facing message.
      safeLog.error("chat.stream-error", {
        requestId,
        chatThreadId: currentChatThread.id,
      });
      return `There was an error generating a response. Please try again. (ref: ${requestId})`;
    },
  });
};

const _buildUserMessage = (props: UserPrompt): ModelMessage => {
  if (props.multimodalImage && props.multimodalImage.length > 0) {
    return {
      role: "user",
      content: [
        { type: "text", text: props.message },
        { type: "image", image: props.multimodalImage },
      ],
    };
  }

  return { role: "user", content: props.message };
};

const _getHistory = async (chatThread: ChatThreadModel, requestId: string) => {
  const historyResponse = await FindTopChatMessagesForCurrentUser(chatThread.id);

  if (historyResponse.status === "OK") {
    return historyResponse.response.reverse();
  }

  safeLog.error("chat.history-lookup-failed", {
    requestId,
    chatThreadId: chatThread.id,
  });
  return [];
};

const _getDocuments = async (chatThread: ChatThreadModel, requestId: string) => {
  const docsResponse = await FindAllChatDocuments(chatThread.id);

  if (docsResponse.status === "OK") {
    return docsResponse.response;
  }

  safeLog.error("chat.document-lookup-failed", {
    requestId,
    chatThreadId: chatThread.id,
  });
  return [];
};
