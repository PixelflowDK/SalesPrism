import { streamText } from "ai";
import { createAzure } from "@ai-sdk/azure";
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from "@azure/identity";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const credential = new DefaultAzureCredential();
  const tokenProvider = getBearerTokenProvider(
    credential,
    "https://cognitiveservices.azure.com/.default"
  );

  const azure = createAzure({
    resourceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME!,
    apiVersion: "2025-01-01-preview",
    apiKey: undefined,
    // @ts-expect-error — azureADTokenProvider ikke i type endnu
    azureADTokenProvider: tokenProvider,
  });

  const result = await streamText({
    model: azure(process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME!),
    messages,
  });

  return result.toUIMessageStreamResponse();
}
