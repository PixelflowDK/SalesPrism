// app-service.bicep — App Service Plan, App Service, and Application Insights for Sales Prism customer stack

param customerSlug string
param location string
param tags object
param appServicePlanSku string
param integrationSubnetId string

var planName = 'plan-azurechat-${customerSlug}'
var appName = 'app-azurechat-${customerSlug}'
var appInsightsName = 'appi-azurechat-${customerSlug}'

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

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 90
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
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY',   value: appInsights.properties.InstrumentationKey }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
      ]
    }
    virtualNetworkSubnetId: integrationSubnetId
  }
}

output appServiceId string = appService.id
output appServicePrincipalId string = appService.identity.principalId
output appServiceHostname string = appService.properties.defaultHostName
