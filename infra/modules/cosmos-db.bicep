// cosmos-db.bicep — Azure Cosmos DB (serverless) for Sales Prism customer stack

param customerSlug string
param location string
param tags object

@description('Zone redundancy for the Cosmos account. Default false per SAD §34.5 (single-region MVP); westeurope zonal capacity is also frequently constrained.')
param enableZoneRedundancy bool = false

var accountName = 'cosmos-azurechat-${customerSlug}'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      { name: 'EnableServerless' }
    ]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: enableZoneRedundancy
      }
    ]
    publicNetworkAccess: 'Disabled'
    disableKeyBasedMetadataWriteAccess: true
    disableLocalAuth: true
    // Pinned explicitly (SR-002): this module's properties object is a full
    // PUT for Microsoft.DocumentDB/databaseAccounts — any property this
    // template omits is reset to the RP default on every deployment, not
    // left as-is. Without this, adding disableLocalAuth here would silently
    // flip the live enableAutomaticFailover (currently true) to false.
    enableAutomaticFailover: true
  }
}

resource deleteLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'cosmos-azurechat-${customerSlug}-delete-lock'
  scope: cosmosAccount
  properties: {
    level: 'CanNotDelete'
    notes: 'Protect customer data from accidental deletion'
  }
}

output cosmosId string = cosmosAccount.id
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
