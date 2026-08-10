import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

// Configure Cosmos DB details
const DB_NAME = process.env.AZURE_COSMOSDB_DB_NAME || "chat";
const CONTAINER_NAME = process.env.AZURE_COSMOSDB_CONTAINER_NAME || "history";
const CONFIG_CONTAINER_NAME = process.env.AZURE_COSMOSDB_CONFIG_CONTAINER_NAME || "config";

// Zero-secrets Cosmos DB access (SAD §5.3, CLAUDE.md "Never Violated" list; SR-002/H-1).
// No Cosmos DB key environment variable may ever be read here — DefaultAzureCredential
// (managed identity) only, matching azure-ai.ts / document-intelligence.ts / azure-speech.ts.
export const CosmosInstance = () => {
  const endpoint = process.env.AZURE_COSMOSDB_URI;

  if (!endpoint) {
    throw new Error(
      "Azure Cosmos DB endpoint is not configured. Please configure it in the .env file."
    );
  }

  return new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
};

export const ConfigContainer = () => {
  const client = CosmosInstance();
  const database = client.database(DB_NAME);
  const container = database.container(CONFIG_CONTAINER_NAME);
  return container;
};

export const HistoryContainer = () => {
  const client = CosmosInstance();
  const database = client.database(DB_NAME);
  const container = database.container(CONTAINER_NAME);
  return container;
};
