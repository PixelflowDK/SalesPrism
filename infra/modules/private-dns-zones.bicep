// private-dns-zones.bicep — 6 private DNS zones with VNet links for Sales Prism customer stack.
// F3 (codex-review-1, finding 3): added privatelink.cognitiveservices.azure.com for
// Document Intelligence (kind 'FormRecognizer' uses the generic Cognitive Services
// zone/groupId 'account' — distinct from the OpenAI-specific zone above).
// Outputs zone resource IDs — consumed by modules/private-endpoints.bicep for
// privateDnsZoneGroups bindings (F2).

param vnetId string
param tags object

var zones = [
  'privatelink.openai.azure.com'
  'privatelink.search.windows.net'
  'privatelink.documents.azure.com'
  'privatelink.vaultcore.azure.net'
  'privatelink.blob.core.windows.net'
  'privatelink.cognitiveservices.azure.com'
]

resource dnsZones 'Microsoft.Network/privateDnsZones@2020-06-01' = [for zone in zones: {
  name: zone
  location: 'global'
  tags: tags
}]

resource vnetLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = [for (zone, i) in zones: {
  name: '${replace(zone, '.', '-')}-link'
  parent: dnsZones[i]
  location: 'global'
  tags: tags
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}]

output openAiDnsZoneId string = dnsZones[0].id
output aiSearchDnsZoneId string = dnsZones[1].id
output cosmosDnsZoneId string = dnsZones[2].id
output keyVaultDnsZoneId string = dnsZones[3].id
output storageDnsZoneId string = dnsZones[4].id
output cognitiveServicesDnsZoneId string = dnsZones[5].id
