// customer-resource-group.bicep — creates the per-customer resource group
targetScope = 'subscription'

param name string
param location string
param tags object

resource customerRg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: name
  location: location
  tags: tags
}

output resourceGroupName string = customerRg.name
output resourceGroupId string = customerRg.id
