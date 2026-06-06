// private-dns-zones.bicep — 5 private DNS zones with VNet links for Sales Prism customer stack

param vnetId string
param tags object

var zones = [
  'privatelink.openai.azure.com'
  'privatelink.search.windows.net'
  'privatelink.documents.azure.com'
  'privatelink.vaultcore.azure.net'
  'privatelink.blob.core.windows.net'
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
