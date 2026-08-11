// cosmos-db.bicep — Azure Cosmos DB (serverless) for Sales Prism customer stack

param customerSlug string
param location string
param tags object

@description('Zone redundancy for the Cosmos account. Default false per SAD §34.5 (single-region MVP); westeurope zonal capacity is also frequently constrained.')
param enableZoneRedundancy bool = false

// ---------------------------------------------------------------------------
// SR-007 (2026-08-11) — backup policy. SAD §22.1 decided Continuous Backup
// (Continuous30Days, self-service point-in-time restore) for Phase B onward,
// naming a Bicep parameter `enableContinuousBackup` that never existed in this
// module — the account silently ran on the RP's Periodic default (240min
// interval / 8h retention, support-ticket-only restore) instead. This wires
// the SAD's own decision. Default true (Continuous) for all new deployments.
// Existing accounts: periodic-to-continuous migration is supported in place
// by the RP (verified via `az cosmosdb update --backup-policy-type Continuous
// --continuous-tier Continuous30Days` and a `what-if` Modify-only diff before
// this was applied to val1 — see docs/deployment-record.md 2026-08-11) but is
// ONE-WAY: once migrated, an account cannot be moved back to Periodic. Set
// `false` only for an account that must stay Periodic for a documented reason.
// ---------------------------------------------------------------------------
@description('SAD §22.1 — Continuous Backup (point-in-time restore, self-service, 30-day window) vs. Periodic (240min interval, 8h retention, Azure Support restore only). Continuous is the decided default; migration from Periodic is one-way.')
param enableContinuousBackup bool = true

@description('SQL API database name. Must match src/features/common/services/cosmos.ts AZURE_COSMOSDB_DB_NAME default ("chat") — app-service.bicep does not currently set that app setting, so the code default is authoritative.')
param databaseName string = 'chat'

@description('Chat-history container name. Must match cosmos.ts AZURE_COSMOSDB_CONTAINER_NAME default ("history"). Holds ChatThreadModel/ChatMessageModel/ChatDocumentModel/ChatCitationModel, partitioned on the end-user id.')
param historyContainerName string = 'history'

@description('Tenant-config container name. Must match cosmos.ts AZURE_COSMOSDB_CONFIG_CONTAINER_NAME default ("config"). Holds TenantTheme/ModuleConfig/UserAccount/CustomerEntity/MeetingBriefDocument/ActivityEvent/GDPR erasure audit records — all keyed, per established convention, on tenantSlug stored in the /userId path (never an end-user id).')
param configContainerName string = 'config'

@description('SR-009 / SAD §32.1 — chat prompts, completions and uploaded-document metadata expire after 90 days. Must match cosmos-retention.ts CHAT_HISTORY_TTL_SECONDS exactly.')
var historyContainerDefaultTtl = 7776000 // 90 days — CHAT_HISTORY_TTL_SECONDS

@description('SR-009 / SAD §32.1 — config container is mixed-purpose (tenant config that must never expire + ActivityEvent that expires after 30 days via its own per-item ttl). Container default must stay -1 ("TTL enabled, nothing expires unless the item sets its own ttl") — never a positive number, or TenantTheme/UserAccount/etc. would silently be deleted. Must match cosmos-retention.ts CONFIG_CONTAINER_DEFAULT_TTL exactly.')
var configContainerDefaultTtl = -1

var accountName = 'cosmos-azurechat-${customerSlug}'

var backupPolicy = enableContinuousBackup ? {
  type: 'Continuous'
  continuousModeProperties: {
    tier: 'Continuous30Days'
  }
} : {
  type: 'Periodic'
  periodicModeProperties: {
    backupIntervalInMinutes: 240
    backupRetentionIntervalInHours: 8
    backupStorageRedundancy: 'Geo'
  }
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      { name: 'EnableServerless' }
    ]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: enableZoneRedundancy
      }
    ]
    publicNetworkAccess: 'Disabled'
    disableKeyBasedMetadataWriteAccess: true
    disableLocalAuth: true
    // Pinned explicitly (SR-002): this module's properties object is a full
    // PUT for Microsoft.DocumentDB/databaseAccounts — any property this
    // template omits is reset to the RP default on every deployment, not
    // left as-is. Without this, adding disableLocalAuth here would silently
    // flip the live enableAutomaticFailover (currently true) to false.
    enableAutomaticFailover: true
    // SR-007 — explicit backupPolicy (see enableContinuousBackup above). This
    // property was previously omitted entirely, which is why the RP silently
    // defaulted every account to Periodic/240min/8h regardless of the SAD's
    // documented Continuous decision.
    backupPolicy: backupPolicy
  }
}

resource deleteLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'cosmos-azurechat-${customerSlug}-delete-lock'
  scope: cosmosAccount
  properties: {
    level: 'CanNotDelete'
    notes: 'Protect customer data from accidental deletion'
  }
}

// SR-009 — the account alone is not enough: cosmos.ts / cosmos-retention.ts
// require the `chat` database and `history`/`config` containers to already
// exist (they read/replace containers, they do not create databases). This
// was the root cause of theme.get-failed on every page load — see
// git show 9272277:infra/resources.bicep for the upstream reference this
// ports forward, unchanged on partition-key shape.
//
// Serverless account (EnableServerless capability, confirmed live against
// cosmos-azurechat-val1): neither the database nor the containers below may
// declare throughput/autoscale options — the RP rejects it.
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  name: databaseName
  parent: cosmosAccount
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// Partition key path is /userId (matches upstream exactly); the value
// written there is the authenticated end-user's id (currentUserId()) — see
// chat-thread-service.ts.
resource historyContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  name: historyContainerName
  parent: database
  properties: {
    resource: {
      id: historyContainerName
      partitionKey: {
        paths: [
          '/userId'
        ]
        kind: 'Hash'
      }
      defaultTtl: historyContainerDefaultTtl
    }
  }
}

// Partition key path is /userId (matches upstream exactly), but by
// established app convention the value written there is always the
// tenantSlug, never an end-user id — see tenant-theme.ts, user-service.ts,
// activity-service.ts, context-injection.ts, customer-entity-service.ts,
// meeting-brief-service.ts and gdpr-erasure-service.ts, all of which query
// with `partitionKey: tenantSlug`.
resource configContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  name: configContainerName
  parent: database
  properties: {
    resource: {
      id: configContainerName
      partitionKey: {
        paths: [
          '/userId'
        ]
        kind: 'Hash'
      }
      defaultTtl: configContainerDefaultTtl
    }
  }
}

output cosmosId string = cosmosAccount.id
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabaseId string = database.id
output cosmosDatabaseName string = database.name
output cosmosHistoryContainerId string = historyContainer.id
output cosmosHistoryContainerName string = historyContainer.name
output cosmosConfigContainerId string = configContainer.id
output cosmosConfigContainerName string = configContainer.name
