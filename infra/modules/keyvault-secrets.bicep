// keyvault-secrets.bicep — SR-001
//
// Writes the Entra confidential-client credential and the NextAuth signing secret
// into the customer Key Vault as ARM CONTROL-PLANE resources
// (Microsoft.KeyVault/vaults/secrets).
//
// Why control-plane rather than `az keyvault secret set`:
// the vault is private-endpoint-only (`publicNetworkAccess: Disabled`), so the
// data plane is unreachable from anywhere outside the VNet — a data-plane write
// returns `ForbiddenByConnection` regardless of RBAC. The alternative used in an
// earlier attempt was to temporarily open a firewall exception, which widens
// network exposure for the duration of the write. Creating the secrets as ARM
// resources needs no network exception at all: Resource Manager writes them
// through the management plane. Strictly less exposure for the same outcome.
//
// Values are `@secure()`, so they are excluded from deployment history, from
// `az deployment ... show`, and from activity-log entries.

@description('Name of the customer Key Vault (kv-azurechat-{slug}).')
param keyVaultName string

@description('Entra confidential-client secret consumed by NextAuth via a Key Vault reference. Never logged.')
@secure()
param azureAdClientSecret string

@description('NextAuth JWT/session signing secret. Never logged.')
@secure()
param nextAuthSecret string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Secret names MUST match the SecretUri values already wired into
// app-service.bicep's app settings, or the reference resolves to SecretNotFound
// and the app silently starts without an auth provider registered — which is
// exactly the outage this module resolves.
resource azureAdClientSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'azure-ad-client-secret'
  properties: {
    value: azureAdClientSecret
    contentType: 'Entra confidential-client secret for salescoach360-{slug}-auth'
    attributes: {
      enabled: true
    }
  }
}

resource nextAuthSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'nextauth-secret'
  properties: {
    value: nextAuthSecret
    contentType: 'NextAuth session/JWT signing secret'
    attributes: {
      enabled: true
    }
  }
}

// Deliberately no outputs. Emitting a secret URI is harmless, but emitting
// anything derived from the values would surface them in deployment history.
