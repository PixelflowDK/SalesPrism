"use server";
import "server-only";

import { revalidatePath } from "next/cache";
import { RemoveChatDocument } from "../chat-services/chat-document-service";

/**
 * W6 (`/documents`) — thin void-returning wrapper around `RemoveChatDocument`
 * so it can be bound directly as a `<form action={...}>` (form actions must
 * return `void | Promise<void>`, not a `ServerActionResponse`). Ownership is
 * re-verified inside `RemoveChatDocument` itself from the session — this
 * wrapper never trusts `documentId` beyond passing it through.
 */
export const removeChatDocumentAction = async (documentId: string): Promise<void> => {
  const result = await RemoveChatDocument(documentId);
  if (result.status !== "OK") {
    throw new Error(result.errors[0]?.message ?? "Unable to remove document.");
  }
  revalidatePath("/documents");
};
