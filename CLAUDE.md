# Sales Prism — azurechat ISV Platform

White-label, multi-tenant AI chat SaaS for Nordic B2B customers.
Built on `microsoft/azurechat` fork. Every customer gets a fully isolated Azure stack.
All data stays within EU (Azure Data Zone Standard EUR). No exceptions.
Built by InsightCast ApS (Kristjan Hugosson) for Sales Coach (Carsten Hoelstad).
Platform domain: sales-prism.com. GitHub org: PixelflowDK.

## Tech Stack

- Next.js 15, App Router, TypeScript strict, Node 22 LTS
- Vercel AI SDK v6 (`ai`, `@ai-sdk/azure`) — replaced azurechat's custom OpenAI streaming
- `@azure/identity` v4.4+ — `DefaultAzureCredential`, `USE_MANAGED_IDENTITIES=true` always
- Azure App Service Linux, `linuxFxVersion: 'NODE|22-lts'`
- Azure OpenAI — GPT-4.1 mini (Standard) / GPT-4.1 (Professional) / GPT-4o (Enterprise)
- Azure AI Search Basic — hybrid search + Semantic Ranker, dedicated per customer
- Azure Cosmos DB serverless — chat history + theme config + module config
- Azure Document Intelligence S0 — PDF/Office parsing
- Bicep + Azure Verified Modules (AVM) + Azure Developer CLI (azd)
- GitHub Actions `workflow_dispatch` — customer provisioning with OIDC
- Cloudflare DNS (proxied: true) + Cloudflare Origin Certificate (Full Strict TLS)
- Private Endpoints for all backend services (VNet 10.0.0.0/24 per customer)

## Architecture Principles — Never Violated

- Azure regions: `northeurope` or `westeurope` ONLY (GDPR)
- Azure OpenAI: `DataZoneStandard` ONLY — never `GlobalStandard` (GDPR R2)
- No API keys anywhere — `USE_MANAGED_IDENTITIES=true` always
- `AZURE_OPENAI_API_KEY` must NEVER be set in any environment or file
- Each customer: isolated resource group `rg-azurechat-{slug}` — dedicated all resources
- `vnetRouteAllEnabled: true` on all App Service VNet integrations
- OIDC workload identity federation for GitHub Actions — no stored credentials
- `--mode Incremental` on all Bicep deployments — never Complete
- Node 22 LTS in all App Service Bicep AND GitHub Actions workflows

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

Customer slugs: lowercase, alphanumeric + hyphens, 2–20 chars, starts with letter.
Reserved (never use as slug): admin, api, www, mail, test, staging, prod.

## Azure Tags (all resources, every deployment)

```
customer:    {slug}
environment: production
managed-by:  sales-prism-provisioning
model-tier:  standard | professional | enterprise
```

## Key Directories

- `infra/` — Bicep modules (**never modify without explicit discussion**)
- `.github/workflows/` — Provisioning workflows (**never modify without explicit discussion**)
- `src/app/api/chat/` — AI streaming (streamText + toDataStreamResponse)
- `src/features/chat-page/chat-services/` — **Migration target** — Vercel AI SDK Sprint 1
- `src/features/auth/` — Entra ID auth (**OFF LIMITS — never modify**)
- `src/components/assistant-ui/` — Chat UI (owned source, fully customisable)
- `.claude/agents/` — Subagent definitions
- `graphify-out/` — Knowledge graph (read-only for subagents, built by main agent)

## Graphify — Knowledge Graph

The project knowledge graph lives in `graphify-out/`.
**Subagents must query the graph, never build it.**
Main agent builds/updates the graph:

```bash
/graphify .          # Full rebuild
/graphify update     # Incremental after changes
```

Subagent queries:
```bash
/graphify query ChatAPIEntry
/graphify query DefaultAzureCredential
/graphify query TenantTheme
```

If graph is missing, fall back to codebase-search.

## Current Sprint

**Phase:** B — Bicep Infrastructure + Automated Provisioning
**Status:** SP-A02 complete. Fork live at PixelflowDK/SalesPrism (develop branch).
**Active brief:** SP-B01 — Bicep modules for per-customer Azure stack

## Subagent Team

| Agent | When to use |
|---|---|
| `azure-infra-engineer` | Bicep, VNet, Private Endpoints, RBAC, AVM |
| `nextjs-developer` | Next.js, streaming, theming, admin portal |
| `rag-engineer` | AI Search, RAG pipeline, Cosmos DB history migration |
| `security-reviewer` | GDPR review, secrets check, RBAC audit (read-only) |
| `cloudflare-dns-engineer` | DNS records, Origin Certificate, PFX conversion |
| `github-actions-engineer` | provision-customer.yml, OIDC, approval gate |
| `qa-webapp-tester` | Playwright smoke tests per deployment |
| `pre-merge-reviewer` | Final quality gate before any merge (Claude Code + Codex) |

## Skills Installed

- `azure-prepare`, `azure-deploy`, `azure-validate`, `azure-compliance`
- `azure-ai`, `azure-quotas`, `entra-app-registration`
- `graphify` — knowledge graph (main agent builds, subagents query)
  - Install: `pip install graphifyy && graphify install` + `npx skills add https://github.com/akillness/oh-my-skills --skill graphify`
- `grill-me` — pre-implementation requirements review (Matt Pocock)
  - Install: `npx skills add https://github.com/mattpocock/skills --skill grill-me`
- `grill-me-codex` — Codex adversarial cross-model review of Claude Code output (Chase AI)
  - Install: `npx skills add https://github.com/chaseai-yt/grill-me-codex`
- `gdpr-data-handling`, `webapp-testing`, `git-workflow`, `skill-creator`

## Off-Limits (requires explicit approval from Kristjan before touching)

- `infra/main.bicep` — core infrastructure template
- `.github/workflows/provision-customer.yml` — provisioning workflow
- `src/features/auth/` — Entra ID authentication
- Any `.bicepparam` file in production environments
- Any file containing CONNECTION_STRING, KEY, or SECRET in the name

## Known Gotchas

- `DataZoneStandard` quota must be checked before new regions — use `azure-quotas` skill
- Entra App Registration needs `Application.ReadWrite.OwnedBy` Graph permission
- Cosmos DB free tier: max 1 per subscription — customers need serverless tier
- Key Vault soft-delete: 90 days — offboarding must account for slug reuse delay
- Cloudflare Origin Certificate is PEM — MUST convert to PFX for App Service
- Node 22 must be set in BOTH App Service Bicep AND GitHub Actions — not just one
- `ChatAPIEntry` in `src/features/chat-page/chat-services/` is decoupled — Phase C Sprint 1
- Next.js 15 + React 19: Radix UI requires `--legacy-peer-deps` during install
- TXT verification records for custom domain MUST have `proxied: false`

## Test Rules

- Tests MUST fail if the feature they test is malfunctioning
- Tests must NEVER patch the application to make themselves pass
- Tests must NEVER modify application code to make tests green
