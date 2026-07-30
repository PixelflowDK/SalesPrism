// app-service.bicep — App Service Plan and App Service for Sales Prism customer stack
// Application Insights / Log Analytics are provisioned by modules/observability.bicep (SAD §31.6)
// and passed in here — do not create a second appi-azurechat-{slug} resource in this module.

param customerSlug string
param location string
param tags object
param appServicePlanSku string
param integrationSubnetId string
param appInsightsInstrumentationKey string
param appInsightsConnectionString string

// ---------------------------------------------------------------------------
// F4 (codex-review-1, finding 4) — real app settings wired from module outputs.
// Contract source: src/features/common/services/azure-ai.ts, ai-search.ts,
// cosmos.ts, key-vault.ts, azure-storage.ts, document-intelligence.ts, and
// src/.env.example / src/types/type.ts (required env var names — exact match).
// Every value below comes from a param supplied by main.bicep out of another
// module's output — never a literal resource name/endpoint, never a secret.
// ---------------------------------------------------------------------------
@description('Azure OpenAI resource name (NOT the endpoint URL) — azure-ai.ts requireEnv("AZURE_OPENAI_API_INSTANCE_NAME").')
param openAiInstanceName string

@description('Azure OpenAI REST API version — azure-ai.ts AZURE_OPENAI_API_VERSION.')
param openAiApiVersion string

@description('Chat model deployment name — azure-ai.ts AZURE_OPENAI_CHAT_DEPLOYMENT.')
param chatDeploymentName string

@description('Embedding model deployment name — azure-ai.ts AZURE_OPENAI_EMBEDDING_DEPLOYMENT.')
param embeddingDeploymentName string

@description('Embedding vector width — azure-ai.ts AZURE_OPENAI_EMBEDDING_DIMENSIONS.')
param embeddingDimensions int

@description('Azure AI Search resource name (NOT the endpoint URL) — ai-search.ts AZURE_SEARCH_NAME.')
param searchName string

@description('Azure AI Search index name — ai-search.ts / azure-ai-search.ts AZURE_SEARCH_INDEX_NAME.')
param searchIndexName string

@description('Cosmos DB endpoint URI — cosmos.ts AZURE_COSMOSDB_URI.')
param cosmosDbUri string

@description('Key Vault name (NOT the endpoint URL) — key-vault.ts AZURE_KEY_VAULT_NAME.')
param keyVaultName string

@description('Storage account name — azure-storage.ts AZURE_STORAGE_ACCOUNT_NAME.')
param storageAccountName string

@description('Document Intelligence endpoint URL — document-intelligence.ts AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT.')
param documentIntelligenceEndpoint string

@description('Customer slug echoed back as TENANT_SLUG — src/features/theme/tenant-resolver.ts fallback when the Host header is not a recognized {slug}-sales360 subdomain.')
param tenantSlug string

var planName = 'plan-azurechat-${customerSlug}'
var appName = 'app-azurechat-${customerSlug}'

// Placeholder only — the real customer FQDN ({slug}-sales360.pixelflow.dk) is
// created later by the provisioning workflow's configure-dns job, which is
// not available at Bicep-deploy time. This standard *.azurewebsites.net
// default hostname is derived from the App Service's own name (not a
// hardcoded resource name/secret) and is a working URL until the custom
// hostname is bound. NEXTAUTH_URL is required by src/types/type.ts and read
// by src/features/chat-page/chat-services/chat-image-service.ts — all other
// auth-related settings (AUTH_*, AZURE_AD_*, NEXTAUTH_SECRET) are left
// untouched, per src/features/auth/ being off-limits.
var nextAuthUrlPlaceholder = 'https://${appName}.azurewebsites.net'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: appServicePlanSku
  }
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-01-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      vnetRouteAllEnabled: true
      appSettings: [
        { name: 'AZURE_OPENAI_API_INSTANCE_NAME',   value: openAiInstanceName }
        { name: 'AZURE_OPENAI_API_VERSION',         value: openAiApiVersion }
        { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT',     value: chatDeploymentName }
        { name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT', value: embeddingDeploymentName }
        { name: 'AZURE_OPENAI_EMBEDDING_DIMENSIONS', value: string(embeddingDimensions) }
        { name: 'AZURE_SEARCH_NAME',                value: searchName }
        { name: 'AZURE_SEARCH_INDEX_NAME',          value: searchIndexName }
        { name: 'AZURE_COSMOSDB_URI',               value: cosmosDbUri }
        { name: 'AZURE_KEY_VAULT_NAME',             value: keyVaultName }
        { name: 'AZURE_STORAGE_ACCOUNT_NAME',       value: storageAccountName }
        { name: 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', value: documentIntelligenceEndpoint }
        { name: 'USE_MANAGED_IDENTITIES',           value: 'true' }
        { name: 'TENANT_SLUG',                      value: tenantSlug }
        { name: 'NEXTAUTH_URL',                     value: nextAuthUrlPlaceholder }
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY',   value: appInsightsInstrumentationKey }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
      ]
    }
    virtualNetworkSubnetId: integrationSubnetId
  }
}

output appServiceId string = appService.id
output appServicePrincipalId string = appService.identity.principalId
output appServiceHostname string = appService.properties.defaultHostName
