// storage.bicep — Azure Storage Account for Sales Prism customer stack

param customerSlug string
param location string
param tags object

// ---------------------------------------------------------------------------
// SR-007 (2026-08-11) — blob soft delete was completely disabled (confirmed
// live on stval136sepgklp44gk: deleteRetentionPolicy.enabled=false), meaning
// zero accidental-deletion recovery window and never a deliberate, documented
// decision. Enabling it creates a GDPR tension that must be stated plainly,
// not glossed over: `EraseDataSubject` (gdpr-erasure-service.ts,
// `eraseBlobsForThreads`) hard-deletes image blobs on an erasure request, but
// once soft delete is enabled, Azure retains a RECOVERABLE copy of every
// "deleted" blob for exactly this many days — an erased data subject's image
// is therefore not truly gone from Microsoft's storage until this window also
// elapses. 7 days is chosen as the shortest practical window that gives real
// accidental-deletion protection (the reason soft delete exists at all) while
// keeping the GDPR erasure tail short and precisely documented rather than
// silently absent (0 days) or needlessly long. See
// docs/gdpr-erasure-evidence.md for the full retention-chain statement this
// value feeds into.
// ---------------------------------------------------------------------------
@minValue(1)
@maxValue(365)
@description('SR-007 — blob soft-delete retention window (days). GDPR tension: this many days after an erasure-triggered hard delete, the blob remains recoverable by Azure before being permanently purged. Keep in sync with docs/gdpr-erasure-evidence.md.')
param blobSoftDeleteRetentionDays int = 7

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
    allowSharedKeyAccess: false
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

// SR-007 — explicit blob soft-delete retention. Deliberately scoped to blob
// soft delete ONLY (not container soft delete, versioning, or change feed —
// those remain intentionally off; see docs/known-limitations.md for why).
// This resource is additive to the account (not a full-object PUT of
// storageAccount.properties above), so it carries no risk of resetting any
// storageAccount property verified live before this change.
resource blobServiceProperties 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  name: 'default'
  parent: storageAccount
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: blobSoftDeleteRetentionDays
    }
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
