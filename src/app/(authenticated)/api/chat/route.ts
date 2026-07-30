import { ChatAPIEntry } from "@/features/chat-page/chat-services/chat-handler";
import { UserPrompt } from "@/features/chat-page/chat-services/models";

export async function POST(req: Request): Promise<Response> {
  const formData = await req.formData();
  const content = formData.get("content") as string | null;

  if (!content) {
    return new Response("Missing chat request content", { status: 400 });
  }

  const props = JSON.parse(content) as UserPrompt;
  props.multimodalImage = (formData.get("image-base64") as string) ?? "";

  return await ChatAPIEntry(props, req.signal);
}
