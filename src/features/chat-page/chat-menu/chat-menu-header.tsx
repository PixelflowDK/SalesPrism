import { CreateChatAndRedirect } from "../chat-services/chat-thread-service";
import { ChatContextMenu } from "./chat-context-menu";
import { NewChat } from "./new-chat";

export const ChatMenuHeader = () => {
  return (
    <div className="flex p-3">
      <form action={CreateChatAndRedirect} className="flex gap-2 w-full">
        <NewChat />
        <ChatContextMenu />
      </form>
    </div>
  );
};
