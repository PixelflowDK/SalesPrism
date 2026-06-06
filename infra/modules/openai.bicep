// openai.bicep — Azure OpenAI account with DataZoneStandard deployment (GDPR R2 compliant)
// NEVER use GlobalStandard — DataZoneStandard keeps data within EU Microsoft datacentres.

param customerSlug string
param location string
param tags object

@allowed(['standard', 'professional', 'enterprise'])
param aiModelTier string

var accountName = 'oai-azurechat-${customerSlug}'

// Model mapping — DataZoneStandard capacity is region-specific, verify with azure-quotas before deploying.
var selectedModel = aiModelTier == 'standard' ? {
  name: 'gpt-4o-mini'
  version: '2024-07-18'
  capacity: 30
} : aiModelTier == 'professional' ? {
  name: 'gpt-4-1'
  version: '2025-04-14'
  capacity: 20
} : {
  name: 'gpt-4o'
  version: '2024-11-20'
  capacity: 10
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
  name: selectedModel.name
  parent: openAiAccount
  sku: {
    name: 'DataZoneStandard'
    capacity: selectedModel.capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: selectedModel.name
      version: selectedModel.version
    }
  }
}

output openAiId string = openAiAccount.id
output openAiEndpoint string = openAiAccount.properties.endpoint
