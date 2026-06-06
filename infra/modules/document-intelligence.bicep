// document-intelligence.bicep — Azure Document Intelligence (Form Recognizer) for Sales Prism customer stack

param customerSlug string
param location string
param tags object

var accountName = 'docintel-azurechat-${customerSlug}'

resource docIntelligence 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Disabled'
    customSubDomainName: accountName
  }
}

output documentIntelligenceId string = docIntelligence.id
output documentIntelligenceEndpoint string = docIntelligence.properties.endpoint
