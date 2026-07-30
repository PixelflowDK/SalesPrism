// rbac.bicep — Managed identity RBAC role assignments for Sales Prism customer stack
// 6 ARM role assignments + 1 Cosmos DB SQL data-plane role assignment

param appServicePrincipalId string
param openAiId string
param aiSearchId string
param cosmosId string
param keyVaultId string
param storageId string
param documentIntelligenceId string

// Cognitive Services OpenAI User
var roleOpenAiUser = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
// Search Index Data Contributor
var roleSearchIndexDataContributor = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
// Search Service Contributor
var roleSearchServiceContributor = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
// Key Vault Secrets User
var roleKeyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
// Storage Blob Data Contributor
var roleStorageBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
// Cognitive Services User
var roleCognitiveServicesUser = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource openAiResource 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' existing = {
  name: last(split(openAiId, '/'))
}

resource aiSearchResource 'Microsoft.Search/searchServices@2023-11-01' existing = {
  name: last(split(aiSearchId, '/'))
}

resource keyVaultResource 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: last(split(keyVaultId, '/'))
}

resource storageResource 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: last(split(storageId, '/'))
}

resource docIntelligenceResource 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' existing = {
  name: last(split(documentIntelligenceId, '/'))
}

resource cosmosResource 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' existing = {
  name: last(split(cosmosId, '/'))
}

// 1. OpenAI — Cognitive Services OpenAI User
resource raOpenAi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(openAiId, appServicePrincipalId, roleOpenAiUser)
  scope: openAiResource
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleOpenAiUser)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

// 2. AI Search — Search Index Data Contributor
resource raSearchIndexData 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiSearchId, appServicePrincipalId, roleSearchIndexDataContributor)
  scope: aiSearchResource
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleSearchIndexDataContributor)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

// 3. AI Search — Search Service Contributor
resource raSearchService 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiSearchId, appServicePrincipalId, roleSearchServiceContributor)
  scope: aiSearchResource
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleSearchServiceContributor)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

// 4. Key Vault — Key Vault Secrets User
resource raKeyVault 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultId, appServicePrincipalId, roleKeyVaultSecretsUser)
  scope: keyVaultResource
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsUser)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

// 5. Storage — Storage Blob Data Contributor
resource raStorage 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageId, appServicePrincipalId, roleStorageBlobDataContributor)
  scope: storageResource
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataContributor)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

// 6. Document Intelligence — Cognitive Services User
resource raDocIntelligence 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentIntelligenceId, appServicePrincipalId, roleCognitiveServicesUser)
  scope: docIntelligenceResource
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleCognitiveServicesUser)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

// 7. Cosmos DB — built-in data-plane SQL role (Cosmos DB Built-in Data Contributor)
resource raCosmosDataPlane 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-02-15-preview' = {
  name: guid(cosmosId, appServicePrincipalId, '00000000-0000-0000-0000-000000000002')
  parent: cosmosResource
  properties: {
    roleDefinitionId: '${cosmosId}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: appServicePrincipalId
    scope: cosmosId
  }
}
