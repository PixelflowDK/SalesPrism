import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { DefaultAzureCredential } from "@azure/identity";

// Zero-secrets (CLAUDE.md / SAD R3): always DefaultAzureCredential.
// AZURE_DOCUMENT_INTELLIGENCE_KEY must never be read here.
const debug = process.env.DEBUG === "true";

export const DocumentIntelligenceInstance = () => {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  console.log("Document Intelligence Endpoint:", endpoint);

  if (!endpoint) {
    throw new Error(
      "Document Intelligence environment variable for the endpoint is not set"
    );
  }

  const credential = new DefaultAzureCredential();

  const client = new DocumentAnalysisClient(endpoint, credential);
  if (debug) console.log("Document Analysis Client created:", client);

  return client;
};
