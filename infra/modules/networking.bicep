// networking.bicep — VNet, subnets, and 5 Private Endpoints for Sales Prism customer stack
// AVM not used for Private Endpoints — standard Bicep resource declarations used instead.

param location string
param customerSlug string
param tags object

param openAiId string
param aiSearchId string
param cosmosId string
param keyVaultId string
param storageId string

var vnetName = 'vnet-azurechat-${customerSlug}'
var integrationSubnetName = 'integration'
var privateLinkSubnetName = 'privatelink'

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/24']
    }
    subnets: [
      {
        name: integrationSubnetName
        properties: {
          addressPrefix: '10.0.0.0/26'
          delegations: [
            {
              name: 'appServiceDelegation'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: privateLinkSubnetName
        properties: {
          addressPrefix: '10.0.0.64/26'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var privateLinkSubnetId = '${vnet.id}/subnets/${privateLinkSubnetName}'

// Private Endpoint — Azure OpenAI
resource peOpenAi 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-oai-${customerSlug}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateLinkSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'oai-connection'
        properties: {
          privateLinkServiceId: openAiId
          groupIds: ['account']
        }
      }
    ]
  }
}

// Private Endpoint — Azure AI Search
resource peAiSearch 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-srch-${customerSlug}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateLinkSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'srch-connection'
        properties: {
          privateLinkServiceId: aiSearchId
          groupIds: ['searchService']
        }
      }
    ]
  }
}

// Private Endpoint — Azure Cosmos DB
resource peCosmosDb 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-cosmos-${customerSlug}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateLinkSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'cosmos-connection'
        properties: {
          privateLinkServiceId: cosmosId
          groupIds: ['Sql']
        }
      }
    ]
  }
}

// Private Endpoint — Azure Key Vault
resource peKeyVault 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-kv-${customerSlug}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateLinkSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'kv-connection'
        properties: {
          privateLinkServiceId: keyVaultId
          groupIds: ['vault']
        }
      }
    ]
  }
}

// Private Endpoint — Azure Storage (blob)
resource peStorage 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-st-${customerSlug}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateLinkSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'storage-connection'
        properties: {
          privateLinkServiceId: storageId
          groupIds: ['blob']
        }
      }
    ]
  }
}

output vnetId string = vnet.id
output integrationSubnetId string = '${vnet.id}/subnets/${integrationSubnetName}'
output privateLinkSubnetId string = privateLinkSubnetId
output peOpenAiId string = peOpenAi.id
output peAiSearchId string = peAiSearch.id
output peCosmosDbId string = peCosmosDb.id
output peKeyVaultId string = peKeyVault.id
output peStorageId string = peStorage.id
