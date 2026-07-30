"use client";

import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import type { UIMessage, UIMessageChunk } from "ai";

/**
 * Converts the raw SSE response body from `POST /api/chat`
 * (`streamText(...).toUIMessageStreamResponse()`) into a
 * `ReadableStream<UIMessageChunk>` suitable for `readUIMessageStream`.
 *
 * Mirrors `DefaultChatTransport.processResponseStream` from the `ai` package
 * exactly — reimplemented here (rather than depending on `@ai-sdk/react`)
 * so the existing valtio-based `chat-store.tsx` can stay the source of truth
 * for chat UI state without adopting the `useChat` hook.
 */
export const toUIMessageChunkStream = (
  body: ReadableStream<Uint8Array>
): ReadableStream<UIMessageChunk> =>
  parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema }).pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        if (!chunk.success) {
          throw chunk.error;
        }
        controller.enqueue(chunk.value);
      },
    })
  );

/**
 * Pure helper: flattens the text parts of a (possibly still-streaming)
 * UIMessage into a single display string. Tool-call / tool-result parts
 * (e.g. from the searchDocuments RAG tool) are intentionally not rendered
 * as separate chat bubbles — only the model's final grounded text is shown,
 * matching the pre-migration "chat with your files" UX.
 */
export const extractTextFromUIMessage = (message: UIMessage): string =>
  message.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join("");
