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

var planName = 'plan-azurechat-${customerSlug}'
var appName = 'app-azurechat-${customerSlug}'

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
        { name: 'AZURE_OPENAI_ENDPOINT',            value: '' }
        { name: 'AZURE_SEARCH_ENDPOINT',            value: '' }
        { name: 'AZURE_COSMOSDB_ENDPOINT',          value: '' }
        { name: 'AZURE_KEYVAULT_ENDPOINT',          value: '' }
        { name: 'AZURE_STORAGE_ACCOUNT_NAME',       value: '' }
        { name: 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', value: '' }
        { name: 'USE_MANAGED_IDENTITIES',           value: 'true' }
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
