export const CHAT_DOCUMENT_ATTRIBUTE = "CHAT_DOCUMENT";
export const CHAT_THREAD_ATTRIBUTE = "CHAT_THREAD";
export const MESSAGE_ATTRIBUTE = "CHAT_MESSAGE";
export const CHAT_CITATION_ATTRIBUTE = "CHAT_CITATION";

export interface ChatMessageModel {
  id: string;
  createdAt: Date;
  isDeleted: boolean;
  threadId: string;
  userId: string;
  content: string;
  role: ChatRole;
  name: string;
  multiModalImage?: string;
  type: typeof MESSAGE_ATTRIBUTE;
}

export type ChatRole = "system" | "user" | "assistant" | "function" | "tool";

export interface ChatThreadModel {
  id: string;
  name: string;
  createdAt: Date;
  lastMessageAt: Date;
  userId: string;
  useName: string;
  isDeleted: boolean;
  bookmarked: boolean;
  personaMessage: string;
  personaMessageTitle: string;
  extension: string[];
  type: typeof CHAT_THREAD_ATTRIBUTE;
  /**
   * Sales Coach 360 F-01/F-02 (Stage 5b) — sticky guided-flow context for
   * this thread. Set by `chat-handler.ts`'s per-message keyword classifier
   * (`intent-detection.ts`) and persisted here so the meeting-prep /
   * conversation-coaching system-prompt injection and the `meetingPrep`
   * tool stay active across multiple turns without the seller re-typing the
   * trigger phrase every message. `undefined` on chat threads created
   * before this field existed — treated identically to `null`.
   */
  coachingContext?: "meeting-prep" | "conversation-coaching" | null;
}

export interface UserPrompt {
  id: string; // thread id
  message: string;
  multimodalImage: string;
}

export interface ChatDocumentModel {
  id: string;
  name: string;
  chatThreadId: string;
  userId: string;
  isDeleted: boolean;
  createdAt: Date;
  type: typeof CHAT_DOCUMENT_ATTRIBUTE;
}

export type MenuItemsGroupName = "Bookmarked" | "Past 7 days" | "Previous";

export type MenuItemsGroup = {
  groupName: MenuItemsGroupName;
} & ChatThreadModel;

export type ChatCitationModel = {
  id: string;
  content: any;
  userId: string;
  type: typeof CHAT_CITATION_ATTRIBUTE;
};
