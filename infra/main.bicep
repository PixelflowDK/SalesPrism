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

@description('Region for the Cosmos DB account only. Defaults to azureRegion; override when the primary region has Cosmos capacity constraints (both values remain EU per R1).')
@allowed(['northeurope', 'westeurope', 'swedencentral'])  // swedencentral: ADR-002 EU-only capacity fallback, Cosmos only
param cosmosRegion string = azureRegion

// ---------------------------------------------------------------------------
// F1 (codex-review-1, finding 1) — AI region pinning.
// Hard-pinned to westeurope per ADR-001 (2026-07-30): it is the only
// SAD-approved region with DataZoneStandard coverage for the full ADR-001
// model set (gpt-5.4-mini/gpt-5.4/gpt-5.5 + text-embedding-3-small/-large).
// Widen this @allowed list ONLY via a new ADR once DataZoneStandard quota is
// confirmed in another approved region. All non-AI resources continue to use
// azureRegion (Cosmos keeps its own cosmosRegion override, unchanged).
// ---------------------------------------------------------------------------
@allowed(['westeurope'])
@description('Azure OpenAI deployment region — hard-pinned per ADR-001 until DataZoneStandard quota exists elsewhere. Never wire azureRegion into openAiModule.')
param aiRegion string = 'westeurope'

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

@description('Embedding vector width — must match embeddingModelName AND the AI Search index vectorSearchDimensions (ADR-001: locked at provisioning; 1536 for text-embedding-3-small, 3072 for text-embedding-3-large). Keep in sync with embeddingModelName when overriding either.')
param embeddingModelDimensions int = 1536

@description('Azure OpenAI REST API version consumed by src/features/common/services/azure-ai.ts (AZURE_OPENAI_API_VERSION).')
param openAiApiVersion string = '2025-01-01-preview'

@description('Azure AI Search index name for this customer (AZURE_SEARCH_INDEX_NAME).')
param searchIndexName string = 'idx-${customerSlug}'

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
  speech:               'speech-azurechat-${customerSlug}'  // F-02: extends SAD §25 naming table — see modules/speech.bicep header
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
    location:                   aiRegion // F1: AI resources hard-pinned to westeurope per ADR-001 — never azureRegion
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
    location:     cosmosRegion
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

// F-02 — Azure AI Speech (STT). Co-located with the AI stack: uses aiRegion
// (westeurope, ADR-001-pinned), not azureRegion, per SAD decisions log
// requirement that Speech be EU-resident and co-located with the AI stack.
module speechModule 'modules/speech.bicep' = {
  name: 'deploy-speech-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     aiRegion
    tags:         tags
  }
}

// ---------------------------------------------------------------------------
// 3. Networking — VNet + subnets only.
// F2/F3 restructuring (codex-review-1): Private Endpoint creation moved to
// modules/private-endpoints.bicep (step 5 below), which runs after the DNS
// zones module so it can bind each PE's privateDnsZoneGroups.
// ---------------------------------------------------------------------------
module networkingModule 'modules/networking.bicep' = {
  name: 'deploy-networking-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [rgModule]
  params: {
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
  }
}

// ---------------------------------------------------------------------------
// 4. Private DNS zones (depends on VNet for virtualNetworkLinks).
// Outputs zone resource IDs consumed by private-endpoints.bicep below (F2/F3).
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
// 5. Private Endpoints + privateDnsZoneGroups (F2/F3, codex-review-1 findings 2 & 3).
// Consumes the privatelink subnet from networking + zone IDs from privateDnsModule
// + service resource IDs from the resource modules above — all within the
// customer resource group scope.
// ---------------------------------------------------------------------------
module privateEndpointsModule 'modules/private-endpoints.bicep' = {
  name: 'deploy-pe-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [networkingModule, privateDnsModule, openAiModule, aiSearchModule, cosmosModule, keyVaultModule, storageModule, docIntelligenceModule, speechModule]
  params: {
    customerSlug:         customerSlug
    location:             azureRegion
    tags:                 tags
    privateLinkSubnetId:  networkingModule.outputs.privateLinkSubnetId
    openAiId:             openAiModule.outputs.openAiId
    aiSearchId:           aiSearchModule.outputs.aiSearchId
    cosmosId:             cosmosModule.outputs.cosmosId
    keyVaultId:           keyVaultModule.outputs.keyVaultId
    storageId:            storageModule.outputs.storageId
    documentIntelligenceId: docIntelligenceModule.outputs.documentIntelligenceId
    speechId:             speechModule.outputs.speechId
    openAiDnsZoneId:            privateDnsModule.outputs.openAiDnsZoneId
    aiSearchDnsZoneId:          privateDnsModule.outputs.aiSearchDnsZoneId
    cosmosDnsZoneId:            privateDnsModule.outputs.cosmosDnsZoneId
    keyVaultDnsZoneId:          privateDnsModule.outputs.keyVaultDnsZoneId
    storageDnsZoneId:           privateDnsModule.outputs.storageDnsZoneId
    cognitiveServicesDnsZoneId: privateDnsModule.outputs.cognitiveServicesDnsZoneId
  }
}

// ---------------------------------------------------------------------------
// 6. Observability — Log Analytics + Application Insights (SAD §31.6, per-customer isolation)
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
// 7. App Service (depends on networking for integration subnet, private endpoints
// for DNS resolution, observability for telemetry). F4 (codex-review-1 finding 4):
// real app settings wired from module outputs — see env-var contract comment
// in modules/app-service.bicep.
// ---------------------------------------------------------------------------
module appServiceModule 'modules/app-service.bicep' = {
  name: 'deploy-appservice-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [networkingModule, privateEndpointsModule, observabilityModule]
  params: {
    customerSlug:                  customerSlug
    location:                      azureRegion
    tags:                          tags
    appServicePlanSku:             appServiceSku
    integrationSubnetId:           networkingModule.outputs.integrationSubnetId
    appInsightsInstrumentationKey: observabilityModule.outputs.appInsightsInstrumentationKey
    appInsightsConnectionString:   observabilityModule.outputs.appInsightsConnectionString
    openAiInstanceName:            openAiModule.outputs.openAiName
    openAiApiVersion:              openAiApiVersion
    chatDeploymentName:            openAiModule.outputs.chatModelDeploymentName
    embeddingDeploymentName:       openAiModule.outputs.embeddingModelDeploymentName
    embeddingDimensions:           embeddingModelDimensions
    searchName:                    aiSearchModule.outputs.aiSearchName
    searchIndexName:               searchIndexName
    cosmosDbUri:                   cosmosModule.outputs.cosmosEndpoint
    keyVaultName:                  keyVaultModule.outputs.keyVaultName
    storageAccountName:            storageModule.outputs.storageName
    documentIntelligenceEndpoint:  docIntelligenceModule.outputs.documentIntelligenceEndpoint
    tenantSlug:                    customerSlug
    speechRegion:                  speechModule.outputs.speechRegion
    speechResourceId:              speechModule.outputs.speechId
    speechEndpoint:                speechModule.outputs.speechEndpoint
  }
}

// ---------------------------------------------------------------------------
// 8. RBAC — managed identity role assignments (depends on App Service + all services)
// ---------------------------------------------------------------------------
module rbacModule 'modules/rbac.bicep' = {
  name: 'deploy-rbac-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [appServiceModule, openAiModule, aiSearchModule, cosmosModule, keyVaultModule, storageModule, docIntelligenceModule, speechModule]
  params: {
    appServicePrincipalId:   appServiceModule.outputs.appServicePrincipalId
    openAiId:                openAiModule.outputs.openAiId
    aiSearchId:              aiSearchModule.outputs.aiSearchId
    cosmosId:                cosmosModule.outputs.cosmosId
    keyVaultId:              keyVaultModule.outputs.keyVaultId
    storageId:               storageModule.outputs.storageId
    documentIntelligenceId:  docIntelligenceModule.outputs.documentIntelligenceId
    speechId:                speechModule.outputs.speechId
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
output speechEndpoint          string = speechModule.outputs.speechEndpoint
output speechRegion            string = speechModule.outputs.speechRegion
