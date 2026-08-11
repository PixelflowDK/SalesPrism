// app-service.bicep — App Service Plan and App Service for Sales Prism customer stack
// Application Insights / Log Analytics are provisioned by modules/observability.bicep (SAD §31.6)
// and passed in here — do not create a second appi-azurechat-{slug} resource in this module.

param customerSlug string
param location string
param tags object
param appServicePlanSku string
param integrationSubnetId string
param appInsightsInstrumentationKey string
param appInsightsConnectionString string

// ---------------------------------------------------------------------------
// F4 (codex-review-1, finding 4) — real app settings wired from module outputs.
// Contract source: src/features/common/services/azure-ai.ts, ai-search.ts,
// cosmos.ts, key-vault.ts, azure-storage.ts, document-intelligence.ts, and
// src/.env.example / src/types/type.ts (required env var names — exact match).
// Every value below comes from a param supplied by main.bicep out of another
// module's output — never a literal resource name/endpoint, never a secret.
// ---------------------------------------------------------------------------
@description('Azure OpenAI resource name (NOT the endpoint URL) — azure-ai.ts requireEnv("AZURE_OPENAI_API_INSTANCE_NAME").')
param openAiInstanceName string

@description('Azure OpenAI REST API version — azure-ai.ts AZURE_OPENAI_API_VERSION.')
param openAiApiVersion string

@description('Chat model deployment name — azure-ai.ts AZURE_OPENAI_CHAT_DEPLOYMENT.')
param chatDeploymentName string

@description('Embedding model deployment name — azure-ai.ts AZURE_OPENAI_EMBEDDING_DEPLOYMENT.')
param embeddingDeploymentName string

@description('Embedding vector width — azure-ai.ts AZURE_OPENAI_EMBEDDING_DIMENSIONS.')
param embeddingDimensions int

@description('Azure AI Search resource name (NOT the endpoint URL) — ai-search.ts AZURE_SEARCH_NAME.')
param searchName string

@description('Azure AI Search index name — ai-search.ts / azure-ai-search.ts AZURE_SEARCH_INDEX_NAME.')
param searchIndexName string

@description('Cosmos DB endpoint URI — cosmos.ts AZURE_COSMOSDB_URI.')
param cosmosDbUri string

@description('Key Vault name (NOT the endpoint URL) — key-vault.ts AZURE_KEY_VAULT_NAME.')
param keyVaultName string

@description('Key Vault URI (e.g. https://kv-azurechat-{slug}.vault.azure.net/) — SR-001: used to build Key Vault reference app-setting values below. Never a secret itself.')
param keyVaultUri string

@description('Storage account name — azure-storage.ts AZURE_STORAGE_ACCOUNT_NAME.')
param storageAccountName string

@description('Document Intelligence endpoint URL — document-intelligence.ts AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT.')
param documentIntelligenceEndpoint string

@description('Customer slug echoed back as TENANT_SLUG — src/features/theme/tenant-resolver.ts fallback when the Host header is not a recognized {slug}-sales360 subdomain.')
param tenantSlug string

// ---------------------------------------------------------------------------
// F-02 — Azure AI Speech (STT). Contract defined here in the absence of a
// merged src/app/(authenticated)/api/speech/ token route at the time of
// writing — reconcile these three names with that route once it lands.
// Audio never goes browser -> Azure directly; the API route proxies/issues a
// short-lived Entra token, so no key is ever wired here (zero-secrets rule).
// ---------------------------------------------------------------------------
@description('Azure AI Speech region — proposed contract: AZURE_SPEECH_REGION, consumed by the speech token-issuing API route.')
param speechRegion string

@description('Azure AI Speech account full ARM resource ID — proposed contract: AZURE_SPEECH_RESOURCE_ID (never a key).')
param speechResourceId string

@description('Azure AI Speech account endpoint URL — proposed contract: AZURE_SPEECH_ENDPOINT.')
param speechEndpoint string

// ---------------------------------------------------------------------------
// H-2 (2026-08-11) — ingress restrictions. Without this, the App Service's
// default *.azurewebsites.net hostname is open to the entire internet and
// completely bypasses Cloudflare (WAF, rate limiting, DDoS protection) —
// anyone who discovers app-azurechat-{slug}.azurewebsites.net reaches the
// origin directly. Default TRUE (Cloudflare-only ingress) for all customers.
//
// val1 EXCEPTION: val1 currently runs UNPROXIED (Cloudflare grey-clouded /
// DNS-only) with an App Service-managed certificate, not the Cloudflare
// Origin Certificate + orange-cloud proxy setup SAD §7.2 describes for real
// customers. Enabling this restriction on val1 today would immediately 502
// the live site, because val1's own traffic does not currently arrive via
// Cloudflare's edge IPs. This is set explicitly to `false` for val1 only, in
// infra/environments/validation.bicepparam, with a dated comment there and a
// matching entry in docs/known-limitations.md. Production customers must NOT
// use this exception — see SAD §7.2 for what production requires (Cloudflare
// proxy + Origin Certificate) before this can safely default to true there.
// ---------------------------------------------------------------------------
@description('H-2 — restrict App Service ingress to Cloudflare IP ranges only (default-deny otherwise). Must be false only for an explicitly documented exception (see val1 in known-limitations.md); true for every production customer.')
param restrictIngressToCloudflare bool = true

// ---------------------------------------------------------------------------
// SR-014 — identity settings that were being set by hand and therefore kept
// getting wiped.
//
// App Service app settings are replaced wholesale on every template deploy: a
// setting that exists only because someone ran `az webapp config appsettings
// set` disappears the next time this module is applied. All three below were
// discovered missing from a LIVE app, each causing a different silent failure:
//
//   AZURE_AD_CLIENT_ID / AZURE_AD_TENANT_ID — absent entirely, so the Entra
//   provider guard in auth-page/auth-api.ts short-circuited and
//   /api/auth/providers returned {}. Sign-in was impossible and nothing in the
//   UI said why.
//
//   ADMIN_OBJECT_IDS — absent, so isAdminOid() returned false for everyone and
//   the admin portal was unreachable by ANY account, including the tenant's
//   only Global Administrator. This one is easy to miss because it fails
//   CLOSED and looks like correct authorization: /admin serves the
//   "not authorized" page rather than erroring. Found only by signing in as a
//   real admin and observing `isAdmin` absent from the session.
//
// These are identifiers, not secrets — object ids and a tenant id, all of them
// readable by any member of the directory. They belong in the template.
// ---------------------------------------------------------------------------

@description('Entra application (client) id for this customer\'s app registration — auth-api.ts AZURE_AD_CLIENT_ID. An identifier, never a secret.')
param azureAdClientId string

@description('Entra directory (tenant) id — auth-api.ts AZURE_AD_TENANT_ID. Single-tenant by design (ADR-003); never set this to `common` or `organizations`.')
param azureAdTenantId string

@description('Comma-separated Entra object ids (oid claim) granted admin rights — ADR-003 isAdminOid(). Object ids, NOT emails: the val1 investigation found the sole admin is an MSA-federated #EXT# account whose mail/preferred_username claims are not stable across logins, so an email allow-list was never safe. Empty means no admins, which fails closed.')
param adminObjectIds string = ''

// Cloudflare published IP ranges — pinned 2026-08-11 from
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6.
// Cloudflare rotates these infrequently but not never; re-fetch both URLs and
// update this list (plus re-run `az bicep build` + a fresh what-if) as part
// of any periodic infra review — do not assume this list is permanent.
var cloudflareIpv4Ranges = [
  '173.245.48.0/20'
  '103.21.244.0/22'
  '103.22.200.0/22'
  '103.31.4.0/22'
  '141.101.64.0/18'
  '108.162.192.0/18'
  '190.93.240.0/20'
  '188.114.96.0/20'
  '197.234.240.0/22'
  '198.41.128.0/17'
  '162.158.0.0/15'
  '104.16.0.0/13'
  '104.24.0.0/14'
  '172.64.0.0/13'
  '131.0.72.0/22'
]
var cloudflareIpv6Ranges = [
  '2400:cb00::/32'
  '2606:4700::/32'
  '2803:f800::/32'
  '2405:b500::/32'
  '2405:8100::/32'
  '2a06:98c0::/29'
  '2c0f:f248::/32'
]

var cloudflareIpSecurityRestrictions = [for (range, i) in concat(cloudflareIpv4Ranges, cloudflareIpv6Ranges): {
  ipAddress: range
  action: 'Allow'
  priority: 100 + i
  name: 'cloudflare-${i}'
  description: 'Cloudflare edge IP range — pinned 2026-08-11'
}]

var planName = 'plan-azurechat-${customerSlug}'
var appName = 'app-azurechat-${customerSlug}'

// ---------------------------------------------------------------------------
// SR-001 — Key Vault references for the two auth secrets (docs/security-
// decision-log.md). Fixed secret-name convention within the customer's own
// Key Vault (kv-azurechat-{slug}) — the provisioning pipeline (Entra app
// registration step) and rotation runbook must write to these exact names.
// Using the unversioned `SecretUri` form (no `/<version>` segment) means
// rotating the secret's value in Key Vault takes effect without a redeploy —
// App Service polls for a new version automatically. The App Service platform
// resolves the reference itself, over the private VNet integration, using the
// managed identity's `Key Vault Secrets User` role (rbac.bicep) — the app
// process only ever sees the resolved secret in process.env, never this
// string, and this string itself is not a secret (it is a pointer).
// ---------------------------------------------------------------------------
var azureAdClientSecretKeyVaultRef = '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/azure-ad-client-secret/)'
var nextAuthSecretKeyVaultRef = '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/nextauth-secret/)'

// Placeholder only — the real customer FQDN ({slug}-sales360.pixelflow.dk) is
// created later by the provisioning workflow's configure-dns job, which is
// not available at Bicep-deploy time. This standard *.azurewebsites.net
// default hostname is derived from the App Service's own name (not a
// hardcoded resource name/secret) and is a working URL until the custom
// hostname is bound. NEXTAUTH_URL is required by src/types/type.ts and read
// by src/features/chat-page/chat-services/chat-image-service.ts — all other
// auth-related settings (AUTH_*, AZURE_AD_*, NEXTAUTH_SECRET) are left
// untouched, per src/features/auth/ being off-limits.
var nextAuthUrlPlaceholder = 'https://${appName}.azurewebsites.net'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: appServicePlanSku
  }
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-01-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      vnetRouteAllEnabled: true
      // H-2 — main-site ingress. When restrictIngressToCloudflare is true:
      // allow-list Cloudflare's edge ranges, default-deny everything else.
      // When false (val1 exception only): no restrictions, matching prior
      // (unrestricted) behavior exactly — this branch exists so the val1
      // exception doesn't 502 the live, currently-unproxied site.
      ipSecurityRestrictions: restrictIngressToCloudflare ? cloudflareIpSecurityRestrictions : []
      ipSecurityRestrictionsDefaultAction: restrictIngressToCloudflare ? 'Deny' : 'Allow'
      // H-2 — SCM/Kudu (deployment) endpoint deliberately NOT restricted to
      // Cloudflare here. Cloudflare does not proxy *.scm.azurewebsites.net —
      // applying the same Cloudflare-only allow-list to SCM would break every
      // deployment path this team actually uses (`az webapp deploy` ZipDeploy
      // over Kudu, and the future provision-customer.yml GitHub Actions
      // pipeline), not just tighten security. SCM hardening is a distinct,
      // deliberately deferred piece of work — the SAD decisions log already
      // notes the real target state ("Access Restrictions tillader GitHub
      // Actions IP-ranges på SCM-endpoint"), which requires GitHub's published
      // Actions IP ranges (large, rotate more often than Cloudflare's) and is
      // out of scope for H-2. Left at the platform default (open) rather than
      // silently reusing the main-site list, which would be actively wrong.
      // Tracked in docs/known-limitations.md — do not silently "fix" this by
      // copying ipSecurityRestrictions here without doing that work for real.
      scmIpSecurityRestrictionsUseMain: false
      appSettings: [
        { name: 'AZURE_OPENAI_API_INSTANCE_NAME',   value: openAiInstanceName }
        { name: 'AZURE_OPENAI_API_VERSION',         value: openAiApiVersion }
        { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT',     value: chatDeploymentName }
        { name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT', value: embeddingDeploymentName }
        { name: 'AZURE_OPENAI_EMBEDDING_DIMENSIONS', value: string(embeddingDimensions) }
        { name: 'AZURE_SEARCH_NAME',                value: searchName }
        { name: 'AZURE_SEARCH_INDEX_NAME',          value: searchIndexName }
        { name: 'AZURE_COSMOSDB_URI',               value: cosmosDbUri }
        { name: 'AZURE_KEY_VAULT_NAME',             value: keyVaultName }
        // SR-001 — Key Vault references, never plaintext secrets. See the
        // comment above `azureAdClientSecretKeyVaultRef` for the naming
        // convention and rotation behavior. Resolves to "Unresolved" in the
        // Azure portal until the provisioning pipeline creates the two
        // secrets in this customer's Key Vault — expected on a fresh deploy,
        // not a template bug.
        { name: 'AZURE_AD_CLIENT_SECRET',           value: azureAdClientSecretKeyVaultRef }
        { name: 'NEXTAUTH_SECRET',                  value: nextAuthSecretKeyVaultRef }
        // SR-014 — see the param block above for why these three must live in
        // the template rather than being applied by hand.
        { name: 'AZURE_AD_CLIENT_ID',               value: azureAdClientId }
        { name: 'AZURE_AD_TENANT_ID',               value: azureAdTenantId }
        { name: 'ADMIN_OBJECT_IDS',                 value: adminObjectIds }
        { name: 'AZURE_STORAGE_ACCOUNT_NAME',       value: storageAccountName }
        { name: 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', value: documentIntelligenceEndpoint }
        { name: 'AZURE_SPEECH_REGION',              value: speechRegion }
        { name: 'AZURE_SPEECH_RESOURCE_ID',         value: speechResourceId }
        { name: 'AZURE_SPEECH_ENDPOINT',            value: speechEndpoint }
        { name: 'USE_MANAGED_IDENTITIES',           value: 'true' }
        { name: 'TENANT_SLUG',                      value: tenantSlug }
        { name: 'NEXTAUTH_URL',                     value: nextAuthUrlPlaceholder }
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY',   value: appInsightsInstrumentationKey }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
      ]
    }
    virtualNetworkSubnetId: integrationSubnetId
  }
}

output appServiceId string = appService.id
output appServicePrincipalId string = appService.identity.principalId
output appServiceHostname string = appService.properties.defaultHostName
// H-5 (2026-08-11) — App Service Plan resource id, needed for the CPU alert
// scope in modules/alerts.bicep. Purely additive.
output appServicePlanId string = appServicePlan.id
