// networking.bicep — VNet + subnets for Sales Prism customer stack.
//
// F2/F3 restructuring (codex-review-1, findings 2 & 3): Private Endpoint
// creation and privateDnsZoneGroups binding moved to modules/private-endpoints.bicep.
// That module needs private DNS zone resource IDs from modules/private-dns-zones.bicep,
// which in turn needs this module's vnetId for its virtualNetworkLinks — so the
// dependency chain is: networking (VNet only) -> private-dns-zones (zones + links,
// consumes vnetId) -> private-endpoints (PEs + zone groups, consumes zone IDs +
// privateLinkSubnetId). This module is intentionally VNet/subnet-only now.

param location string
param customerSlug string
param tags object

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

output vnetId string = vnet.id
output integrationSubnetId string = '${vnet.id}/subnets/${integrationSubnetName}'
output privateLinkSubnetId string = '${vnet.id}/subnets/${privateLinkSubnetName}'
