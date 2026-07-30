// observability.bicep — Per-customer Log Analytics Workspace + Application Insights (SAD §31.6)
// Per-customer isolation: no shared workspace with other customers or the ISV platform RG.
// GDPR-minimum retention is 30 days; may be increased per signed contract addendum only.

param customerSlug string
param location string
param tags object

@minValue(30)
@maxValue(730)
@description('Log Analytics / Application Insights retention in days. GDPR-minimum is 30.')
param retentionDays int = 30

var workspaceName = 'law-azurechat-${customerSlug}'
var appInsightsName = 'appi-azurechat-${customerSlug}'

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionDays
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    RetentionInDays: retentionDays
  }
}

output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output appInsightsId string = appInsights.id
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output appInsightsConnectionString string = appInsights.properties.ConnectionString
