// key-vault.bicep — Azure Key Vault for Sales Prism customer stack
// RBAC authorization enabled — no legacy access policies.

param customerSlug string
param location string
param tags object

var vaultName = 'kv-azurechat-${customerSlug}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    publicNetworkAccess: 'disabled'
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
}

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
