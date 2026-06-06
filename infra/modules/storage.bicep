// storage.bicep — Azure Storage Account for Sales Prism customer stack

param customerSlug string
param location string
param tags object

var storageName = 'st${customerSlug}${uniqueString(resourceGroup().id)}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
  }
}

resource deleteLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'st-${customerSlug}-delete-lock'
  scope: storageAccount
  properties: {
    level: 'CanNotDelete'
    notes: 'Protect customer data from accidental deletion'
  }
}

output storageId string = storageAccount.id
output storageName string = storageAccount.name
