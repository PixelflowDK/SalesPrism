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

// SAD §32.1 GDPR data-retention: "Uploadede dokumenter ... 90 dage TTL ...
// Blob TTL + AI Search index sletning". This applies to the blob-storage
// side of that row — the `images` blob container (chat multimodal image
// uploads, see chat-image-service.ts). Native Azure Storage lifecycle
// management, applied at the account level with a container-name filter,
// so it takes effect even though the `images` container itself is created
// out-of-band by the running app on first upload (not by this Bicep) —
// the policy simply has nothing to act on until blobs exist there.
//
// NOTE: uploaded PDF/DOCX/XLSX document *content* is never itself written
// to blob storage in this codebase — `chat-document-service.ts` streams
// the file directly to Document Intelligence in memory, then only the
// extracted/chunked text is persisted (to the AI Search index). Only chat
// multimodal image uploads use blob storage today. See
// docs/known-limitations.md for the AI Search side of this retention row
// (no native per-document TTL exists there — erasure-on-request is fully
// implemented, but a blanket 90-day sweep of the index is not).
resource blobLifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = {
  name: 'default'
  parent: storageAccount
  properties: {
    policy: {
      rules: [
        {
          enabled: true
          name: 'delete-images-after-90-days'
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: [
                'blockBlob'
              ]
              prefixMatch: [
                'images/'
              ]
            }
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: 90
                }
              }
            }
          }
        }
      ]
    }
  }
}

output storageId string = storageAccount.id
output storageName string = storageAccount.name
