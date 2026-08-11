// deny-openai-global-standard.bicep — H-3 (2026-08-11) subscription-scope Azure Policy definition.
//
// GDPR R2: Azure OpenAI model deployments must use DataZoneStandard only, never GlobalStandard
// (GlobalStandard can route inference outside the EU). Today this is enforced ONLY by the
// @allowed(['DataZoneStandard']) decorator on infra/main.bicep's aiModelSkuName param and the
// matching decorator in infra/modules/openai.bicep — a one-line PR removing either decorator would
// silently defeat it with no subscription-level backstop. This policy is that backstop.
//
// Targets Microsoft.CognitiveServices/accounts/deployments (the sub-resource that actually carries
// the model SKU — see openAiDeployment/embeddingDeployment in modules/openai.bicep), using the
// verified alias `Microsoft.CognitiveServices/accounts/deployments/sku.name` (confirmed live via
// `az provider show -n Microsoft.CognitiveServices --expand "resourceTypes/aliases"` on
// 2026-08-11 — not guessed). Applies regardless of which Cognitive Services `kind` the parent
// account is, since `deployments` sub-resources only meaningfully exist for OpenAI-kind accounts
// in this subscription's usage today; scoping tighter to `kind: 'OpenAI'` would require a second
// alias lookup on the parent resource that policy conditions on child resources cannot reliably
// join against, so this denies GlobalStandard on ANY Cognitive Services deployment sub-resource,
// which is strictly safer (more restrictive), not looser, than intended.
//
// Defines ONLY the policy — zero enforcement effect until assigned. See the trailing comment for
// the assignment command (not run by this agent — operator decision).
targetScope = 'subscription'

resource denyOpenAiGlobalStandard 'Microsoft.Authorization/policyDefinitions@2021-06-01' = {
  name: 'sales-prism-deny-openai-globalstandard'
  properties: {
    displayName: 'Sales Prism — deny GlobalStandard SKU on Azure OpenAI deployments'
    description: 'GDPR R2 / SAD §16.2. Denies creation or update of any Microsoft.CognitiveServices/accounts/deployments resource with sku.name = GlobalStandard. DataZoneStandard is the only permitted deployment SKU for Azure OpenAI in this subscription. Subscription-level backstop for the @allowed([\'DataZoneStandard\']) decorators in infra/main.bicep and infra/modules/openai.bicep.'
    policyType: 'Custom'
    mode: 'Indexed'
    metadata: {
      category: 'Sales Prism'
      version: '1.0.0'
      source: 'infra/policy/deny-openai-global-standard.bicep — H-3, 2026-08-11'
    }
    policyRule: {
      if: {
        allOf: [
          {
            field: 'type'
            equals: 'Microsoft.CognitiveServices/accounts/deployments'
          }
          {
            field: 'Microsoft.CognitiveServices/accounts/deployments/sku.name'
            equals: 'GlobalStandard'
          }
        ]
      }
      then: {
        effect: 'deny'
      }
    }
  }
}

output policyDefinitionId string = denyOpenAiGlobalStandard.id
output policyDefinitionName string = denyOpenAiGlobalStandard.name

// ---------------------------------------------------------------------------
// Assignment command (NOT run by this agent):
//
//   az policy assignment create \
//     --name sales-prism-deny-openai-globalstandard \
//     --display-name "Sales Prism — deny GlobalStandard on Azure OpenAI" \
//     --scope "/subscriptions/<subscription-id>" \
//     --policy sales-prism-deny-openai-globalstandard
//
// Recommend assigning with --enforcement-mode DoNotEnforce first and checking
// `az policy state list` for a compliance pass against every existing
// oai-azurechat-{slug} deployment (all should already be DataZoneStandard —
// confirmed for oai-azurechat-val1 via `az cognitiveservices account
// deployment list`) before switching to Default (enforcing).
// ---------------------------------------------------------------------------
