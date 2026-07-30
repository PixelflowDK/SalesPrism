// speech.bicep — Azure AI Speech (Speech-to-Text streaming) for Sales Prism customer stack
// Backlog F-02 / SAD decisions log: "Azure AI Speech Service — real-time streaming,
// EU-datacenter, GDPR-sikker, proxy via Next.js API route (audio never direct browser→Azure)".
//
// Naming note: `speech-azurechat-${customerSlug}` extends the SAD §25 naming table, which does
// not yet list a Speech resource. Follows the same `{service}-azurechat-{slug}` pattern as every
// other Cognitive Services account (docintel-azurechat-{slug}, oai-azurechat-{slug}). Flag for
// SAD §25 update alongside this change.
//
// disableLocalAuth: `disableLocalAuth` is a generic top-level property on
// Microsoft.CognitiveServices/accounts (confirmed present, if unset/null, on the existing
// docintel-azurechat-val1 FormRecognizer account via `az cognitiveservices account show` — it is
// not gated per-kind in the ARM schema) and is documented by Microsoft as supported for
// SpeechServices to enforce Microsoft Entra ID (managed identity) token auth only, matching the
// zero-secrets rule. Not verified end-to-end via live deployment in this change (CLI-validation
// only, no deployments per task scope) — flag for confirmation on first real `az deployment` run.

param customerSlug string
param location string
param tags object

var accountName = 'speech-azurechat-${customerSlug}'

resource speechAccount 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: accountName
  location: location
  tags: tags
  kind: 'SpeechServices'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    customSubDomainName: accountName
  }
}

output speechId string = speechAccount.id
output speechName string = speechAccount.name
output speechEndpoint string = speechAccount.properties.endpoint
output speechRegion string = location
