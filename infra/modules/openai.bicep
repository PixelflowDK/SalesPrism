// openai.bicep — Azure OpenAI account with DataZoneStandard deployment (GDPR R2 compliant)
// NEVER use GlobalStandard — DataZoneStandard keeps data within EU Microsoft datacentres.
// Model baseline: ADR-001 (2026-07-30) — re-baselined off the deprecated GPT-4.x family.

param customerSlug string
param location string
param tags object

@allowed(['standard', 'professional', 'enterprise'])
param aiModelTier string

@allowed(['DataZoneStandard'])
@description('Azure OpenAI deployment SKU — GDPR R2: DataZoneStandard only, never GlobalStandard.')
param aiModelSkuName string = 'DataZoneStandard'

@description('Override the tier-mapped chat model name. Leave empty to use the ADR-001 tier default.')
param chatModelNameOverride string = ''

@description('Override the tier-mapped chat model version. Leave empty to use the ADR-001 tier default.')
param chatModelVersionOverride string = ''

@description('Override the tier-mapped chat model capacity (1K TPM units). Leave 0 to use the ADR-001 tier default.')
param chatModelCapacityOverride int = 0

@description('Embedding model name — GA per ADR-001 (text-embedding-3-small until the -large quota grant lands).')
param embeddingModelName string = 'text-embedding-3-small'

@description('Embedding model version.')
param embeddingModelVersion string = '1'

@description('Embedding model deployment capacity (1K TPM units).')
param embeddingModelCapacity int = 30

var accountName = 'oai-azurechat-${customerSlug}'

// Tier -> chat model mapping per ADR-001 (2026-07-30). Verify quota with azure-quotas skill before deploying
// professional/enterprise — gpt-5.4 and gpt-5.5 are quota-gated on this subscription as of the ADR date.
var tierModel = aiModelTier == 'standard' ? {
  name: 'gpt-5.4-mini'
  version: '2026-03-17'
  capacity: 30
} : aiModelTier == 'professional' ? {
  name: 'gpt-5.4'
  version: '2026-03-05'
  capacity: 20
} : {
  name: 'gpt-5.5'
  version: '2026-04-24'
  capacity: 10
}

var selectedChatModel = {
  name: empty(chatModelNameOverride) ? tierModel.name : chatModelNameOverride
  version: empty(chatModelVersionOverride) ? tierModel.version : chatModelVersionOverride
  capacity: chatModelCapacityOverride == 0 ? tierModel.capacity : chatModelCapacityOverride
}

resource openAiAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Disabled'
    customSubDomainName: accountName
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  name: selectedChatModel.name
  parent: openAiAccount
  sku: {
    name: aiModelSkuName
    capacity: selectedChatModel.capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: selectedChatModel.name
      version: selectedChatModel.version
    }
  }
}

// Embeddings — required for RAG indexing (SAD §9). GA model, deployed alongside the chat model.
resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  name: embeddingModelName
  parent: openAiAccount
  sku: {
    name: aiModelSkuName
    capacity: embeddingModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: embeddingModelVersion
    }
  }
  // Cognitive Services accounts reject concurrent deployment PUTs — serialize behind the chat model deployment.
  dependsOn: [openAiDeployment]
}

output openAiId string = openAiAccount.id
output openAiName string = openAiAccount.name
output openAiEndpoint string = openAiAccount.properties.endpoint
output chatModelDeploymentName string = openAiDeployment.name
output embeddingModelDeploymentName string = embeddingDeployment.name
