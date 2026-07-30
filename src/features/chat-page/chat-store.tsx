"use client";
import { uniqueId } from "@/features/common/util";
import { showError } from "@/features/globals/global-message-store";
import { AI_NAME, NEW_CHAT_NAME } from "@/features/theme/theme-config";
import { readUIMessageStream, type UIMessage } from "ai";
import { FormEvent } from "react";
import { proxy, useSnapshot } from "valtio";
import { RevalidateCache } from "../common/navigation-helpers";
import { InputImageStore } from "../ui/chat/chat-input-area/input-image-store";
import { textToSpeechStore } from "./chat-input/speech/use-text-to-speech";
import { ResetInputRows } from "./chat-input/use-chat-input-dynamic-height";
import {
  AddExtensionToChatThread,
  RemoveExtensionFromChatThread,
  UpdateChatTitle,
} from "./chat-services/chat-thread-service";
import { ChatMessageModel, ChatThreadModel } from "./chat-services/models";
import { extractTextFromUIMessage, toUIMessageChunkStream } from "./ui-message-stream";
let abortController: AbortController = new AbortController();

type chatStatus = "idle" | "loading" | "file upload";

class ChatState {
  public messages: Array<ChatMessageModel> = [];
  public loading: chatStatus = "idle";
  public input: string = "";
  public lastMessage: string = "";
  public autoScroll: boolean = false;
  public userName: string = "";
  public chatThreadId: string = "";

  private chatThread: ChatThreadModel | undefined;

  private addToMessages(message: ChatMessageModel) {
    const currentMessage = this.messages.find((el) => el.id === message.id);
    if (currentMessage) {
      currentMessage.content = message.content;
    } else {
      this.messages.push(message);
    }
  }

  private removeMessage(id: string) {
    const index = this.messages.findIndex((el) => el.id === id);
    if (index > -1) {
      this.messages.splice(index, 1);
    }
  }

  public updateLoading(value: chatStatus) {
    this.loading = value;
  }

  public initChatSession({
    userName,
    messages,
    chatThread,
  }: {
    chatThread: ChatThreadModel;
    userName: string;
    messages: Array<ChatMessageModel>;
  }) {
    this.chatThread = chatThread;
    this.chatThreadId = chatThread.id;
    this.messages = messages;
    this.userName = userName;
  }

  public async AddExtensionToChatThread(extensionId: string) {
    this.loading = "loading";

    const response = await AddExtensionToChatThread({
      extensionId: extensionId,
      chatThreadId: this.chatThreadId,
    });
    RevalidateCache({
      page: "chat",
      type: "layout",
    });

    if (response.status !== "OK") {
      showError(response.errors[0].message);
    }

    this.loading = "idle";
  }

  public async RemoveExtensionFromChatThread(extensionId: string) {
    this.loading = "loading";

    const response = await RemoveExtensionFromChatThread({
      extensionId: extensionId,
      chatThreadId: this.chatThreadId,
    });

    RevalidateCache({
      page: "chat",
    });

    if (response.status !== "OK") {
      showError(response.errors[0].message);
    }

    this.loading = "idle";
  }

  public updateInput(value: string) {
    this.input = value;
  }

  public stopGeneratingMessages() {
    abortController.abort();
  }

  public updateAutoScroll(value: boolean) {
    this.autoScroll = value;
  }

  private reset() {
    this.input = "";
    ResetInputRows();
    InputImageStore.Reset();
  }

  private async chat(formData: FormData) {
    this.updateAutoScroll(true);
    this.loading = "loading";

    const multimodalImage = formData.get("image-base64") as unknown as string;

    const newUserMessage: ChatMessageModel = {
      id: uniqueId(),
      role: "user",
      content: this.input,
      name: this.userName,
      multiModalImage: multimodalImage,
      createdAt: new Date(),
      isDeleted: false,
      threadId: this.chatThreadId,
      type: "CHAT_MESSAGE",
      userId: "",
    };

    this.messages.push(newUserMessage);
    this.reset();

    const controller = new AbortController();
    abortController = controller;

    try {
      if (this.chatThreadId === "" || this.chatThreadId === undefined) {
        showError("Chat thread ID is empty");
        return;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        showError(errorText || `Chat request failed (${response.status})`);
        this.removeMessage(newUserMessage.id);
        return;
      }

      if (!response.body) {
        showError("Empty response body from chat API");
        this.removeMessage(newUserMessage.id);
        return;
      }

      const messageStream = readUIMessageStream({
        stream: toUIMessageChunkStream(response.body),
        onError: (error) => console.error("🔴 chat stream error:", error),
        terminateOnError: true,
      });

      // Generated once per turn (not from uiMessage.id) so every incremental
      // snapshot updates the same valtio-store entry, regardless of whether
      // the server's message id is present on the very first streamed chunk.
      const assistantMessageId = uniqueId();

      for await (const uiMessage of messageStream as AsyncIterable<UIMessage>) {
        const content = extractTextFromUIMessage(uiMessage);

        const mappedContent: ChatMessageModel = {
          id: assistantMessageId,
          content,
          name: AI_NAME,
          role: "assistant",
          createdAt: new Date(),
          isDeleted: false,
          threadId: this.chatThreadId,
          type: "CHAT_MESSAGE",
          userId: "",
          multiModalImage: "",
        };

        this.addToMessages(mappedContent);
        this.lastMessage = mappedContent.content;
      }

      this.loading = "idle";
      this.completed(this.lastMessage);
      this.updateTitle();
    } catch (error) {
      if (controller.signal.aborted) {
        this.removeMessage(newUserMessage.id);
      } else {
        showError("" + error);
      }
    } finally {
      this.loading = "idle";
    }
  }

  private async updateTitle() {
    if (this.chatThread && this.chatThread.name === NEW_CHAT_NAME) {
      await UpdateChatTitle(this.chatThreadId, this.messages[0].content);
      RevalidateCache({
        page: "chat",
        type: "layout",
      });
    }
  }

  private completed(message: string) {
    textToSpeechStore.speak(message);
  }

  public async submitChat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (this.input === "" || this.loading !== "idle") {
      return;
    }

    // get form data from e
    const formData = new FormData(e.currentTarget);

    const body = JSON.stringify({
      id: this.chatThreadId,
      message: this.input,
    });
    formData.append("content", body);

    this.chat(formData);
  }
}

export const chatStore = proxy(new ChatState());

export const useChat = () => {
  return useSnapshot(chatStore, { sync: true });
};
