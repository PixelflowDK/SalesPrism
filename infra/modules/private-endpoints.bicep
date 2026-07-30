// private-endpoints.bicep — Private Endpoints + privateDnsZoneGroups for the
// Sales Prism customer stack (codex-review-1 findings 2 & 3).
//
// Consumes:
//   - privateLinkSubnetId from modules/networking.bicep
//   - service resource IDs from modules/openai.bicep, ai-search.bicep,
//     cosmos-db.bicep, key-vault.bicep, storage.bicep, document-intelligence.bicep
//   - private DNS zone resource IDs from modules/private-dns-zones.bicep
//
// Each Private Endpoint gets a Microsoft.Network/privateEndpoints/privateDnsZoneGroups
// child resource bound to the matching zone, so name resolution over the
// private link actually works once publicNetworkAccess is Disabled — without
// this, the app cannot resolve any of these services (see finding 2 & 3).

param location string
param customerSlug string
param tags object

param privateLinkSubnetId string

param openAiId string
param aiSearchId string
param cosmosId string
param keyVaultId string
param storageId string
param documentIntelligenceId string

param openAiDnsZoneId string
param aiSearchDnsZoneId string
param cosmosDnsZoneId string
param keyVaultDnsZoneId string
param storageDnsZoneId string
param cognitiveServicesDnsZoneId string

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

resource peOpenAiZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: peOpenAi
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'openai-config'
        properties: {
          privateDnsZoneId: openAiDnsZoneId
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

resource peAiSearchZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: peAiSearch
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'search-config'
        properties: {
          privateDnsZoneId: aiSearchDnsZoneId
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

resource peCosmosDbZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: peCosmosDb
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cosmos-config'
        properties: {
          privateDnsZoneId: cosmosDnsZoneId
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

resource peKeyVaultZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: peKeyVault
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'vault-config'
        properties: {
          privateDnsZoneId: keyVaultDnsZoneId
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

resource peStorageZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: peStorage
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob-config'
        properties: {
          privateDnsZoneId: storageDnsZoneId
        }
      }
    ]
  }
}

// Private Endpoint — Azure Document Intelligence (F3, codex-review-1 finding 3)
resource peDocIntelligence 'Microsoft.Network/privateEndpoints@2023-09-01' = {
  name: 'pe-docintel-${customerSlug}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateLinkSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'docintel-connection'
        properties: {
          privateLinkServiceId: documentIntelligenceId
          groupIds: ['account']
        }
      }
    ]
  }
}

resource peDocIntelligenceZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = {
  name: 'default'
  parent: peDocIntelligence
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'cognitiveservices-config'
        properties: {
          privateDnsZoneId: cognitiveServicesDnsZoneId
        }
      }
    ]
  }
}

output peOpenAiId string = peOpenAi.id
output peAiSearchId string = peAiSearch.id
output peCosmosDbId string = peCosmosDb.id
output peKeyVaultId string = peKeyVault.id
output peStorageId string = peStorage.id
output peDocIntelligenceId string = peDocIntelligence.id
