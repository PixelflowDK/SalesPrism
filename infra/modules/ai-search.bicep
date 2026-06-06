// ai-search.bicep — Azure AI Search for Sales Prism customer stack

param customerSlug string
param location string
param tags object

@allowed(['basic', 'standard'])
param aiSearchSku string

var searchName = 'srch-azurechat-${customerSlug}'

resource aiSearch 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchName
  location: location
  tags: tags
  sku: {
    name: aiSearchSku
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    publicNetworkAccess: 'disabled'
  }
}

output aiSearchId string = aiSearch.id
output aiSearchEndpoint string = 'https://${aiSearch.name}.search.windows.net'
