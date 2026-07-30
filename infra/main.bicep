// main.bicep — Sales Prism subscription-scoped orchestrator
// Deploys a fully isolated per-customer Azure stack.
// All data remains within EU Microsoft datacentres (DataZoneStandard, northeurope/westeurope only).
targetScope = 'subscription'

@description('Customer identifier — lowercase, alphanumeric, max 20 chars')
param customerSlug string

@description('Company display name')
param companyName string

@allowed(['northeurope', 'westeurope'])
param azureRegion string = 'northeurope'

@allowed(['B1', 'B3', 'P1v3'])
@description('App Service Plan SKU. B1 is validation-environment only — never use for a production customer.')
param appServiceSku string = 'B3'

@allowed(['standard', 'professional', 'enterprise'])
param aiModelTier string = 'standard'

@allowed(['basic', 'standard'])
param aiSearchSku string = 'basic'

param enableZeroDataRetention bool = false

@allowed(['production', 'validation'])
@description('Deployment environment tag. "validation" is for internal test stacks only — never a paying customer.')
param environmentTag string = 'production'

// ---------------------------------------------------------------------------
// AI model deployment overrides — ADR-001 (2026-07-30) baseline.
// Leave at defaults for production customers; the tier mapping in modules/openai.bicep
// already reflects ADR-001. Overrides exist so the validation environment (and any future
// quota-driven adjustment) can deviate without editing module source.
// ---------------------------------------------------------------------------
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

@minValue(30)
@maxValue(730)
@description('Log Analytics / Application Insights retention in days (SAD §31.6). GDPR-minimum is 30.')
param logRetentionDays int = 30

// ---------------------------------------------------------------------------
// Naming — follow SAD Section 25 conventions exactly.
// ---------------------------------------------------------------------------
var names = {
  resourceGroup:        'rg-azurechat-${customerSlug}'
  appServicePlan:       'plan-azurechat-${customerSlug}'
  appService:           'app-azurechat-${customerSlug}'
  openAi:               'oai-azurechat-${customerSlug}'
  aiSearch:             'srch-azurechat-${customerSlug}'
  cosmosDb:             'cosmos-azurechat-${customerSlug}'
  keyVault:             'kv-azurechat-${customerSlug}'
  storage:              'st${customerSlug}'  // uniqueString suffix appended inside storage module
  documentIntelligence: 'docintel-azurechat-${customerSlug}'
  vnet:                 'vnet-azurechat-${customerSlug}'
  appInsights:          'appi-azurechat-${customerSlug}'
}

// ---------------------------------------------------------------------------
// Tags — applied to all resources.
// ---------------------------------------------------------------------------
var tags = {
  customer:     customerSlug
  environment:  environmentTag
  'managed-by': 'sales-prism-provisioning'
  'model-tier': aiModelTier
}

// ---------------------------------------------------------------------------
// 1. Customer resource group (subscription scope)
// ---------------------------------------------------------------------------
module rgModule 'modules/customer-resource-group.bicep' = {
  name: 'deploy-rg-${customerSlug}'
  params: {
    name:     names.resourceGroup
    location: azureRegion
    tags:     tags
  }
}

// ---------------------------------------------------------------------------
// 2. Core services — all deployed into the customer resource group.
// ---------------------------------------------------------------------------
module openAiModule 'modules/openai.bicep' = {
  name: 'deploy-openai-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug:               customerSlug
    location:                   azureRegion
    tags:                       tags
    aiModelTier:                aiModelTier
    aiModelSkuName:             aiModelSkuName
    chatModelNameOverride:      chatModelNameOverride
    chatModelVersionOverride:   chatModelVersionOverride
    chatModelCapacityOverride:  chatModelCapacityOverride
    embeddingModelName:         embeddingModelName
    embeddingModelVersion:      embeddingModelVersion
    embeddingModelCapacity:     embeddingModelCapacity
  }
}

module aiSearchModule 'modules/ai-search.bicep' = {
  name: 'deploy-aisearch-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
    aiSearchSku:  aiSearchSku
  }
}

module cosmosModule 'modules/cosmos-db.bicep' = {
  name: 'deploy-cosmos-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
  }
}

module keyVaultModule 'modules/key-vault.bicep' = {
  name: 'deploy-keyvault-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
  }
}

module storageModule 'modules/storage.bicep' = {
  name: 'deploy-storage-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
  }
}

module docIntelligenceModule 'modules/document-intelligence.bicep' = {
  name: 'deploy-docintel-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
  }
}

// ---------------------------------------------------------------------------
// 3. Networking — VNet, subnets, private endpoints (depends on all services)
// ---------------------------------------------------------------------------
module networkingModule 'modules/networking.bicep' = {
  name: 'deploy-networking-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule, openAiModule, aiSearchModule, cosmosModule, keyVaultModule, storageModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
    openAiId:     openAiModule.outputs.openAiId
    aiSearchId:   aiSearchModule.outputs.aiSearchId
    cosmosId:     cosmosModule.outputs.cosmosId
    keyVaultId:   keyVaultModule.outputs.keyVaultId
    storageId:    storageModule.outputs.storageId
  }
}

// ---------------------------------------------------------------------------
// 4. Private DNS zones (depends on VNet)
// ---------------------------------------------------------------------------
module privateDnsModule 'modules/private-dns-zones.bicep' = {
  name: 'deploy-privatedns-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [networkingModule]
  params: {
    vnetId: networkingModule.outputs.vnetId
    tags:   tags
  }
}

// ---------------------------------------------------------------------------
// 5. Observability — Log Analytics + Application Insights (SAD §31.6, per-customer isolation)
// ---------------------------------------------------------------------------
module observabilityModule 'modules/observability.bicep' = {
  name: 'deploy-observability-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug:  customerSlug
    location:      azureRegion
    tags:          tags
    retentionDays: logRetentionDays
  }
}

// ---------------------------------------------------------------------------
// 6. App Service (depends on networking for integration subnet, observability for telemetry)
// ---------------------------------------------------------------------------
module appServiceModule 'modules/app-service.bicep' = {
  name: 'deploy-appservice-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [networkingModule, observabilityModule]
  params: {
    customerSlug:                  customerSlug
    location:                      azureRegion
    tags:                          tags
    appServicePlanSku:             appServiceSku
    integrationSubnetId:           networkingModule.outputs.integrationSubnetId
    appInsightsInstrumentationKey: observabilityModule.outputs.appInsightsInstrumentationKey
    appInsightsConnectionString:   observabilityModule.outputs.appInsightsConnectionString
  }
}

// ---------------------------------------------------------------------------
// 7. RBAC — managed identity role assignments (depends on App Service + all services)
// ---------------------------------------------------------------------------
module rbacModule 'modules/rbac.bicep' = {
  name: 'deploy-rbac-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [appServiceModule, openAiModule, aiSearchModule, cosmosModule, keyVaultModule, storageModule, docIntelligenceModule]
  params: {
    appServicePrincipalId:   appServiceModule.outputs.appServicePrincipalId
    openAiId:                openAiModule.outputs.openAiId
    aiSearchId:              aiSearchModule.outputs.aiSearchId
    cosmosId:                cosmosModule.outputs.cosmosId
    keyVaultId:              keyVaultModule.outputs.keyVaultId
    storageId:               storageModule.outputs.storageId
    documentIntelligenceId:  docIntelligenceModule.outputs.documentIntelligenceId
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output resourceGroupName      string = names.resourceGroup
output appServiceHostname     string = appServiceModule.outputs.appServiceHostname
output openAiEndpoint         string = openAiModule.outputs.openAiEndpoint
output chatModelDeploymentName string = openAiModule.outputs.chatModelDeploymentName
output embeddingModelDeploymentName string = openAiModule.outputs.embeddingModelDeploymentName
output aiSearchEndpoint       string = aiSearchModule.outputs.aiSearchEndpoint
output cosmosEndpoint         string = cosmosModule.outputs.cosmosEndpoint
output keyVaultUri            string = keyVaultModule.outputs.keyVaultUri
output storageName            string = storageModule.outputs.storageName
output documentIntelligenceEndpoint string = docIntelligenceModule.outputs.documentIntelligenceEndpoint
output logAnalyticsWorkspaceId string = observabilityModule.outputs.logAnalyticsWorkspaceId
output appInsightsId           string = observabilityModule.outputs.appInsightsId
