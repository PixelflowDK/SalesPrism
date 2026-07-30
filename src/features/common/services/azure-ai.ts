import "server-only";

import { createAzure } from "@ai-sdk/azure";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import type { AzureOpenAIProvider } from "@ai-sdk/azure";
import type { EmbeddingModel, LanguageModel } from "ai";

// Zero-secrets Azure OpenAI access (SAD §5.3, CLAUDE.md "Never Violated" list).
// No Azure OpenAI API-key environment variable may ever be read or set here —
// DefaultAzureCredential (managed identity) only.
const AZURE_COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";

/**
 * ADR-001 (2026-07-30) deployment-name contract. Values default to the names
 * infra/modules/openai.bicep actually deploys (deployment resource name ==
 * model name in this Bicep module), NOT generic "chat"/"embedding" aliases.
 * Override per-customer via App Service settings if a tier uses a different model.
 */
export const AZURE_OPENAI_CHAT_DEPLOYMENT =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-5.4-mini";

export const AZURE_OPENAI_EMBEDDING_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small";

/**
 * Embedding vector width. Must match the deployed embedding model AND the
 * `contentVector`/`embedding` field's `vectorSearchDimensions` in the AI Search
 * index (ADR-001: index dimension is locked at provisioning; switching models
 * later requires a reindex from the Blob source — see runbook DR §22.2).
 */
export const AZURE_OPENAI_EMBEDDING_DIMENSIONS = Number(
  process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS || 1536
);

/** Throws a descriptive error instead of silently sending `undefined` to the SDK. */
export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

let cachedProvider: AzureOpenAIProvider | undefined;

/**
 * Single Azure OpenAI provider instance for the whole request lifecycle,
 * authenticated exclusively via DefaultAzureCredential (managed identity).
 * `USE_MANAGED_IDENTITIES` is intentionally not checked here — per
 * CLAUDE.md/SAD R3, managed identity is not optional for this platform.
 */
const getAzureProvider = (): AzureOpenAIProvider => {
  if (cachedProvider) return cachedProvider;

  const credential = new DefaultAzureCredential();
  const tokenProvider = getBearerTokenProvider(
    credential,
    AZURE_COGNITIVE_SERVICES_SCOPE
  );

  cachedProvider = createAzure({
    resourceName: requireEnv("AZURE_OPENAI_API_INSTANCE_NAME"),
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview",
    tokenProvider,
  });

  return cachedProvider;
};

export const getChatModel = (
  deploymentName: string = AZURE_OPENAI_CHAT_DEPLOYMENT
): LanguageModel => getAzureProvider()(deploymentName);

export const getEmbeddingModel = (
  deploymentName: string = AZURE_OPENAI_EMBEDDING_DEPLOYMENT
): EmbeddingModel => getAzureProvider().embedding(deploymentName);
