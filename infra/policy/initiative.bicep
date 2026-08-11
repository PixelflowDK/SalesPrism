// initiative.bicep — H-3 (2026-08-11) subscription-scope Azure Policy initiative (policy set)
// grouping the three Sales Prism custom policy definitions into a single assignable unit.
//
// Deploy the three definition files first (deny-non-eu-region.bicep,
// deny-openai-global-standard.bicep, require-standard-tags.bicep), THEN this initiative — it
// references the definitions by resource id, so it depends on them existing.
//
// Defines ONLY the initiative — zero enforcement effect until assigned. See the trailing comment
// for the assignment command (not run by this agent — operator decision, per this task).
targetScope = 'subscription'

param allowedLocations array = [
  'northeurope'
  'westeurope'
  'swedencentral'
]

resource denyNonEuRegionDef 'Microsoft.Authorization/policyDefinitions@2021-06-01' existing = {
  name: 'sales-prism-deny-non-eu-region'
}

resource denyOpenAiGlobalStandardDef 'Microsoft.Authorization/policyDefinitions@2021-06-01' existing = {
  name: 'sales-prism-deny-openai-globalstandard'
}

resource requireStandardTagsDef 'Microsoft.Authorization/policyDefinitions@2021-06-01' existing = {
  name: 'sales-prism-require-standard-tags'
}

resource salesPrismInitiative 'Microsoft.Authorization/policySetDefinitions@2021-06-01' = {
  name: 'sales-prism-guardrails'
  properties: {
    displayName: 'Sales Prism — infrastructure guardrails (H-3)'
    description: 'GDPR R1/R2 + tagging enforcement backstop for the Sales Prism ISV platform: denies non-EU regions, denies GlobalStandard Azure OpenAI deployments, and requires the four standard resource tags. Mirrors what SAD §16.2 already claims exists — this initiative is what makes that claim true.'
    policyType: 'Custom'
    metadata: {
      category: 'Sales Prism'
      version: '1.0.0'
      source: 'infra/policy/initiative.bicep — H-3, 2026-08-11'
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
    policyDefinitions: [
      {
        policyDefinitionId: denyNonEuRegionDef.id
        policyDefinitionReferenceId: 'denyNonEuRegion'
        parameters: {
          allowedLocations: {
            value: '[parameters(\'allowedLocations\')]'
          }
        }
      }
      {
        policyDefinitionId: denyOpenAiGlobalStandardDef.id
        policyDefinitionReferenceId: 'denyOpenAiGlobalStandard'
      }
      {
        policyDefinitionId: requireStandardTagsDef.id
        policyDefinitionReferenceId: 'requireStandardTags'
      }
    ]
  }
}

output initiativeId string = salesPrismInitiative.id
output initiativeName string = salesPrismInitiative.name

// ---------------------------------------------------------------------------
// Deployment + assignment sequence (definitions + initiative deployment NOT
// run by this agent for the initiative specifically, since it references
// `existing` definitions that must already be deployed — deploying the
// definitions alone, as inert un-assigned resources, is a materially smaller,
// reversible action than a subscription-wide assignment, but is still a
// subscription-scope change outside this task's authorized blast radius
// (rg-azurechat-val1 only) and was therefore also NOT performed by this
// agent. `az bicep build` / `az deployment sub validate` were used instead —
// see docs/deployment-record.md 2026-08-11 for what was actually run.):
//
//   1. az deployment sub create --location westeurope \
//        --template-file infra/policy/deny-non-eu-region.bicep
//   2. az deployment sub create --location westeurope \
//        --template-file infra/policy/deny-openai-global-standard.bicep
//   3. az deployment sub create --location westeurope \
//        --template-file infra/policy/require-standard-tags.bicep
//   4. az deployment sub create --location westeurope \
//        --template-file infra/policy/initiative.bicep
//   5. az policy assignment create \
//        --name sales-prism-guardrails \
//        --display-name "Sales Prism — infrastructure guardrails" \
//        --scope "/subscriptions/<subscription-id>" \
//        --policy-set-definition sales-prism-guardrails \
//        --enforcement-mode DoNotEnforce   # observe compliance first
//   6. Review `az policy state list --policy-set-definition sales-prism-guardrails`
//      for false positives (see require-standard-tags.bicep's NIC-resource
//      caveat), then re-run step 5 with --enforcement-mode Default once clean.
// ---------------------------------------------------------------------------
