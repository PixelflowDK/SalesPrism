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
    disableLocalAuth: true
    // Pinned explicitly (SR-002): this module's properties object is a full
    // PUT for Microsoft.Search/searchServices — any property this template
    // omits is reset to the RP default on every deployment, not left as-is.
    // Without this, adding disableLocalAuth here would silently disable the
    // live Semantic Ranker (val1 currently runs semanticSearch: 'free').
    semanticSearch: 'free'
  }
}

output aiSearchId string = aiSearch.id
output aiSearchName string = aiSearch.name
output aiSearchEndpoint string = 'https://${aiSearch.name}.search.windows.net'
