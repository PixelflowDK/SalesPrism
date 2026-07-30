import {
  SearchClient,
  SearchIndexClient,
  SearchIndexerClient,
} from "@azure/search-documents";
import { DefaultAzureCredential } from "@azure/identity";

// Zero-secrets (CLAUDE.md / SAD R3): Azure AI Search is always accessed via
// DefaultAzureCredential. No Azure AI Search API-key environment variable
// may ever be read here.
const endpointSuffix = process.env.AZURE_SEARCH_ENDPOINT_SUFFIX || "search.windows.net";
const searchName = process.env.AZURE_SEARCH_NAME;
const indexName = process.env.AZURE_SEARCH_INDEX_NAME;
const endpoint = `https://${searchName}.${endpointSuffix}`;
const debug = process.env.DEBUG === "true";

console.log("Configuration parameters:", {
  endpointSuffix,
  searchName,
  indexName,
  endpoint,
});

export const GetCredential = () => {
  const credential = new DefaultAzureCredential();
  if (debug) console.log("Credential obtained via DefaultAzureCredential");
  return credential;
}

export const AzureAISearchInstance = <T extends object>() => {
  console.log("Creating Azure AI Search Client Instance");
  const credential = GetCredential();

  const searchClient = new SearchClient<T>(
    endpoint,
    indexName,
    credential
  );

  console.log("Search Client created:", searchClient);
  return searchClient;
};

export const AzureAISearchIndexClientInstance = () => {
  console.log("Creating Azure AI Search Index Client Instance");
  const credential = GetCredential();

  const searchClient = new SearchIndexClient(
    endpoint,
    credential
  );

  console.log("Search Index Client created:", searchClient);
  return searchClient;
};

export const AzureAISearchIndexerClientInstance = () => {
  console.log("Creating Azure AI Search Indexer Client Instance");
  const credential = GetCredential();

  const client = new SearchIndexerClient(
    endpoint,
    credential
  );

  console.log("Search Indexer Client created:", client);
  return client;
};
