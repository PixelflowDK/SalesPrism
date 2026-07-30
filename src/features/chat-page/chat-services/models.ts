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
