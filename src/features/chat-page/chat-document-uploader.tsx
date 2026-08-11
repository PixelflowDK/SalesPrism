"use client";

import { fileStore, useFileStore } from "@/features/chat-page/chat-input/file/file-store";
import { AttachFile } from "@/features/ui/chat/chat-input-area/attach-file";
import { Label } from "@/features/ui/label";
import Link from "next/link";
import { useState } from "react";

/**
 * W6 (`/documents`) — upload widget, reusing the exact same
 * `AttachFile` + `fileStore.onFileChange` pipeline the chat input uses
 * (CrackDocument → Document Intelligence → IndexDocuments → AI Search →
 * CreateChatDocument). Documents are `chatThreadId`-scoped in the current
 * data model (see chat-document-service.ts) — there is no
 * customer-entity-scoped document concept yet — so uploading here still
 * requires picking which existing conversation the file backs.
 */
export const DocumentUploader = ({ threads }: { threads: { id: string; name: string }[] }) => {
  const [chatThreadId, setChatThreadId] = useState(threads[0]?.id ?? "");
  const { uploadButtonLabel } = useFileStore();

  if (threads.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">
        Start a <Link href="/chat" className="text-primary-text hover:underline">chat</Link> first — documents are
        uploaded into a conversation, then show up here for management.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="upload-target-thread">Add to conversation</Label>
        <select
          id="upload-target-thread"
          value={chatThreadId}
          onChange={(e) => setChatThreadId(e.target.value)}
          className="min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          {threads.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <AttachFile onClick={(formData) => fileStore.onFileChange({ formData, chatThreadId })} />
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {uploadButtonLabel ||
            "Upload a PDF or Office document — processed via Document Intelligence and indexed for search."}
        </span>
      </div>
    </div>
  );
};
