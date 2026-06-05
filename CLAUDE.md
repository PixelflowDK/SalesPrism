# Sales Prism — azurechat ISV Platform

White-label, multi-tenant AI chat SaaS platform for Nordic B2B customers.
Built on `microsoft/azurechat` fork. Every customer gets a fully isolated Azure stack.
All data processing stays within EU Microsoft datacentres (Data Zone Standard EUR).
Built by InsightCast ApS for Sales Coach. Platform domain: sales-prism.com.

## Tech Stack

- Next.js 15, App Router, TypeScript strict
- Vercel AI SDK v6 (`ai`, `@ai-sdk/azure`) — replaces azurechat's custom OpenAI streaming
- `@azure/identity` v4.4+ — DefaultAzureCredential, USE_MANAGED_IDENTITIES=true always
- Azure App Service (Linux, Node 22 LTS)
- Azure OpenAI — GPT-4.1 mini (Standard) / GPT-4.1 (Professional) / GPT-4o (Enterprise)
- Azure AI Search Basic — hybrid search + Semantic Ranker for RAG
- Azure Cosmos DB serverless — chat history + theme config + module config
- Azure Document Intelligence — PDF/Office parsing
- Bicep + Azure Verified Modules (AVM) + Azure Developer CLI (azd)
- GitHub Actions `workflow_dispatch` for customer provisioning
- Cloudflare DNS (proxied: true) + Cloudflare Origin Certificate (Full Strict TLS)
- Private Endpoints for all backend services (VNet 10.0.0.0/24 per customer)

## Key Directories

- `infra/` — Bicep modules (**never modify without explicit discussion**)
- `.github/workflows/` — Provisioning workflows (**never modify without explicit discussion**)
- `src/app/api/chat/` — AI streaming (streamText + toDataStreamResponse)
- `src/features/chat-page/chat-services/` — Service layer pending migration to Vercel AI SDK
- `src/features/auth/` — Entra ID auth (**never modify without explicit discussion**)
- `.claude/agents/` — Subagent definitions
- `docs/sad/` — Solution Architecture Document (SAD v2.0 — primary reference)

## Architecture Principles — Never Violated

- Azure regions: `northeurope` or `westeurope` ONLY (GDPR)
- Azure OpenAI: `DataZoneStandard` ONLY — never `GlobalStandard` (GDPR, violates R2)
- No API keys anywhere — `USE_MANAGED_IDENTITIES=true` always
- `AZURE_OPENAI_API_KEY` must NEVER be set in any environment
- Each customer: isolated resource group `rg-azurechat-{slug}`
- `vnetRouteAllEnabled: true` on all App Service VNet integrations
- OIDC workload identity federation for all GitHub Actions → Azure auth (no stored credentials)

## Naming Conventions

| Resource | Pattern | Example |
|---|---|---|
| Resource Group | `rg-azurechat-{slug}` | `rg-azurechat-dsv` |
| App Service | `app-azurechat-{slug}` | `app-azurechat-dsv` |
| Azure OpenAI | `oai-azurechat-{slug}` | `oai-azurechat-dsv` |
| AI Search | `srch-azurechat-{slug}` | `srch-azurechat-dsv` |
| Cosmos DB | `cosmos-azurechat-{slug}` | `cosmos-azurechat-dsv` |
| Key Vault | `kv-azurechat-{slug}` | `kv-azurechat-dsv` |
| VNet | `vnet-azurechat-{slug}` | `vnet-azurechat-dsv` |
| Storage | `st{slug}{uniqueString}` | `stdsv4x9k2` |

Customer slugs: lowercase, alphanumeric + hyphens, max 20 chars. No reserved words (admin, api, www).

## Azure Tags (all resources, every deployment)

```
customer:    {slug}
environment: production
managed-by:  sales-prism-provisioning
model-tier:  standard | professional | enterprise
```

## Current Sprint

**Phase:** B — Automated Provisioning
**Focus:** Bicep parameterisation, private networking, GitHub Actions workflow + OIDC
**Status:** SP-A02 complete. Fork live at github.com/PixelflowDK/SalesPrism.
**Next:** SP-A03 — First `azd up` deployment to northeurope, verify DataZoneStandard + managed identity

## Subagents

- `azure-infra-engineer` — Use for Bicep authoring, VNet/private endpoint design, ARM deployments
- `security-reviewer` — Use for GDPR compliance checks, RBAC review, Entra ID audit
- `qa-tester` — Use for Playwright UI verification of customer deployments

## Off-Limits (requires explicit approval from Kristjan before touching)

- `infra/main.bicep` — core infrastructure template
- `.github/workflows/provision-customer.yml` — customer provisioning workflow
- `src/features/auth/` — Entra ID authentication
- Any file with CONNECTION_STRING, KEY, or SECRET in the name
- Any `.bicepparam` file in production environments

## Known Gotchas

- `DataZoneStandard` is NOT available in all regions for all model versions — run `azure-quotas` skill first
- Entra ID app registration via Bicep requires `Application.ReadWrite.OwnedBy` Graph permission
- Cosmos DB free tier: max 1 per subscription — new customers need paid/serverless tier
- Key Vault soft-delete retention: 90 days default — offboarding scripts must account for this before slug reuse
- Cloudflare Origin Certificate is PEM format — must convert to PFX for App Service (`openssl pkcs12 -export`)
- Node 22 must be set in App Service Bicep (`linuxFxVersion: 'NODE|22-lts'`) AND GitHub Actions (`node-version: '22'`)
- `ChatAPIEntry` service layer in `src/features/chat-page/chat-services/` is currently decoupled — migration to Vercel AI SDK tools/onFinish is Phase C Sprint 1 work. Do NOT re-integrate the old OpenAI SDK patterns.

## Test Rules

- A test MUST fail if the feature it evaluates is malfunctioning
- Tests must NEVER patch the application at runtime to make themselves pass
- Tests must NEVER modify application code to make tests green
