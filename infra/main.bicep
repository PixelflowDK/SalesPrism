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

@allowed(['B3', 'P1v3'])
param appServiceSku string = 'B3'

@allowed(['standard', 'professional', 'enterprise'])
param aiModelTier string = 'standard'

@allowed(['basic', 'standard'])
param aiSearchSku string = 'basic'

param enableZeroDataRetention bool = false

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
  environment:  'production'
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
    customerSlug: customerSlug
    location:     azureRegion
    tags:         tags
    aiModelTier:  aiModelTier
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
// 5. App Service (depends on networking for integration subnet)
// ---------------------------------------------------------------------------
module appServiceModule 'modules/app-service.bicep' = {
  name: 'deploy-appservice-${customerSlug}'
  scope: resourceGroup(names.resourceGroup)
  dependsOn: [networkingModule]
  params: {
    customerSlug:        customerSlug
    location:            azureRegion
    tags:                tags
    appServicePlanSku:   appServiceSku
    integrationSubnetId: networkingModule.outputs.integrationSubnetId
  }
}

// ---------------------------------------------------------------------------
// 6. RBAC — managed identity role assignments (depends on App Service + all services)
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
    customerSlug:            customerSlug
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output resourceGroupName      string = names.resourceGroup
output appServiceHostname     string = appServiceModule.outputs.appServiceHostname
output openAiEndpoint         string = openAiModule.outputs.openAiEndpoint
output aiSearchEndpoint       string = aiSearchModule.outputs.aiSearchEndpoint
output cosmosEndpoint         string = cosmosModule.outputs.cosmosEndpoint
output keyVaultUri            string = keyVaultModule.outputs.keyVaultUri
output storageName            string = storageModule.outputs.storageName
output documentIntelligenceEndpoint string = docIntelligenceModule.outputs.documentIntelligenceEndpoint
