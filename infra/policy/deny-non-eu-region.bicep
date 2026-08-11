// deny-non-eu-region.bicep — H-3 (2026-08-11) subscription-scope Azure Policy definition.
//
// SAD §16.2 claims "abonnementsniveaupolitik nægter ressourceoprettelse udenfor northeurope og
// westeurope" — no such policy existed anywhere in this subscription; enforcement was ONLY the
// @allowed(['northeurope', 'westeurope']) decorator on infra/main.bicep's azureRegion param (plus
// a separate @allowed(['northeurope', 'westeurope', 'swedencentral']) on cosmosRegion), which a
// one-line PR removing the decorator would silently defeat. This is the real backstop.
//
// Defines ONLY the policy (Microsoft.Authorization/policyDefinitions) — creating a definition has
// zero enforcement effect until it is assigned to a scope. This repo's azure-infra-engineer agent
// does NOT assign subscription-scope policy (a subscription-wide deny is an operator decision) —
// see the assignment command in this file's trailing comment and docs/known-limitations.md.
targetScope = 'subscription'

@description('Allowed Azure regions — northeurope + westeurope (GDPR R1) plus swedencentral (ADR-002, Cosmos DB EU-only capacity fallback only, but this policy does not distinguish by resource type — swedencentral is allowed subscription-wide for simplicity, matching the union of every @allowed() list in infra/main.bicep).')
param allowedLocations array = [
  'northeurope'
  'westeurope'
  'swedencentral'
]

resource denyNonEuRegion 'Microsoft.Authorization/policyDefinitions@2021-06-01' = {
  name: 'sales-prism-deny-non-eu-region'
  properties: {
    displayName: 'Sales Prism — deny resource creation outside approved EU regions'
    description: 'GDPR R1 / SAD §16.2. Denies creation or update of any location-scoped resource outside northeurope, westeurope, or swedencentral. This is a subscription-level backstop for the @allowed() region decorators in infra/main.bicep — it must hold even if those decorators are ever removed or bypassed in a future PR.'
    policyType: 'Custom'
    mode: 'Indexed'
    metadata: {
      category: 'Sales Prism'
      version: '1.0.0'
      source: 'infra/policy/deny-non-eu-region.bicep — H-3, 2026-08-11'
    }
    parameters: {
      allowedLocations: {
        type: 'Array'
        metadata: {
          displayName: 'Allowed locations'
          description: 'The list of locations that resources may be deployed into.'
          strongType: 'location'
        }
        defaultValue: allowedLocations
      }
    }
    policyRule: {
      if: {
        allOf: [
          {
            field: 'location'
            notEquals: 'global'
          }
          {
            field: 'location'
            notIn: '[parameters(\'allowedLocations\')]'
          }
        ]
      }
      then: {
        effect: 'deny'
      }
    }
  }
}

output policyDefinitionId string = denyNonEuRegion.id
output policyDefinitionName string = denyNonEuRegion.name

// ---------------------------------------------------------------------------
// Assignment command (NOT run by this agent — subscription-wide deny is an
// operator decision, per this task's explicit instruction). After this
// definition is deployed (az deployment sub create), an operator assigns it:
//
//   az policy assignment create \
//     --name sales-prism-deny-non-eu-region \
//     --display-name "Sales Prism — deny non-EU regions" \
//     --scope "/subscriptions/<subscription-id>" \
//     --policy sales-prism-deny-non-eu-region \
//     --params '{"allowedLocations":{"value":["northeurope","westeurope","swedencentral"]}}'
//
// Verify with a harmless what-if-style dry run first if available, or assign
// with --enforcement-mode DoNotEnforce initially to observe compliance
// results before switching to Default (enforcing).
// ---------------------------------------------------------------------------
