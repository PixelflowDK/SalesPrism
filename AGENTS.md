# Sales Coach 360 (Sales Prism) — azurechat ISV Platform

White-label, multi-tenant AI chat SaaS for Nordic B2B customers.
Built on `microsoft/azurechat` fork. Every customer gets a fully isolated Azure stack.
All data stays within EU (Azure Data Zone Standard EUR). No exceptions.
Built by InsightCast ApS (Kristjan Hugosson) for Sales Coach (Carsten Hoelstad).
Customer URLs: `{customerSlug}-sales360.pixelflow.dk` (Cloudflare zone `pixelflow.dk`).
GitHub: `PixelflowDK/SalesPrism` (personal account, not an organization).

## Governing documents (read before architectural work)

- `docs/Sales_Prism_SAD_v2.7.md` — Solution Architecture (canonical; Phases A–F in scope)
- `docs/Sales_Coach_360_Feature_Backlog.md` — V1 = F-01..F-04; V2/V3 excluded
- `docs/Frontend_Teknologi_Reference.md` — frontend stack reference
- `docs/architecture-decisions/` — ADRs override the SAD where they conflict
- `docs/project-audit.md` — verified state vs. documented claims
- `OneShotPlan.md` — execution specification

## Tech Stack

- Next.js 15, App Router, TypeScript strict, Node 22 LTS
- Vercel AI SDK v6 (`ai`, `@ai-sdk/azure`) — replaced azurechat's custom OpenAI streaming
- `@azure/identity` v4.4+ — `DefaultAzureCredential`, `USE_MANAGED_IDENTITIES=true` always
- Azure App Service Linux, `linuxFxVersion: 'NODE|22-lts'`
- **Azure OpenAI (ADR-001):** gpt-5.4-mini (Standard) / gpt-5.4 (Professional, quota-gated) / gpt-5.5 (Enterprise, quota-gated) — all DataZoneStandard, westeurope
- Embeddings: text-embedding-3-small now → text-embedding-3-large when quota granted (ADR-001)
- Azure AI Search Basic — hybrid search + Semantic Ranker, dedicated per customer
- Azure Cosmos DB serverless — chat history + theme/module/customer-entity config
- Azure Document Intelligence S0 — PDF/Office parsing
- Azure AI Speech — STT (westeurope), proxied via Next.js API route only
- Bicep + Azure Developer CLI (azd) + GitHub Actions `workflow_dispatch` + OIDC
- Cloudflare DNS (proxied) + Origin Certificate (Full Strict TLS)
- Private Endpoints for all backend services (VNet 10.0.0.0/24 per customer)

## Architecture Principles — Never Violated

- Azure regions: `northeurope` or `westeurope` ONLY (GDPR R1). AI resources: `westeurope` (ADR-001 — DataZoneStandard coverage)
- Azure OpenAI: `DataZoneStandard` ONLY — never `GlobalStandard` (GDPR R2)
- No API keys anywhere — `USE_MANAGED_IDENTITIES=true` always
- `AZURE_OPENAI_API_KEY` must NEVER be set in any environment or file
- Each customer: isolated resource group `rg-azurechat-{slug}` — dedicated all resources
- `vnetRouteAllEnabled: true` on all App Service VNet integrations
- OIDC workload identity federation for GitHub Actions — no stored credentials
- `--mode Incremental` on all Bicep deployments — never Complete
- Node 22 LTS in App Service Bicep AND GitHub Actions workflows
- Cloudflare: only `*-sales360.pixelflow.dk` records may be created/updated; pre-existing `pixelflow.dk` records are untouchable
- Subscription: "Azure subscription 1" only

## Naming Conventions

| Resource | Pattern | Example |
|---|---|---|
| Resource Group | `rg-azurechat-{slug}` | `rg-azurechat-val1` |
| App Service | `app-azurechat-{slug}` | `app-azurechat-val1` |
| Azure OpenAI | `oai-azurechat-{slug}` | `oai-azurechat-val1` |
| AI Search | `srch-azurechat-{slug}` | `srch-azurechat-val1` |
| Cosmos DB | `cosmos-azurechat-{slug}` | `cosmos-azurechat-val1` |
| Key Vault | `kv-azurechat-{slug}` | `kv-azurechat-val1` |
| VNet | `vnet-azurechat-{slug}` | `vnet-azurechat-val1` |
| Storage | `st{slug}{uniqueString}` | `stval14x9k2` |
| Log Analytics | `law-azurechat-{slug}` | `law-azurechat-val1` |
| App Insights | `appi-azurechat-{slug}` | `appi-azurechat-val1` |

Customer slugs: lowercase, alphanumeric + hyphens, 2–20 chars, starts with letter.
Reserved (never use as slug): admin, api, www, mail, test, staging, prod.
DNS: slug `dsv` → `dsv-sales360.pixelflow.dk`.

## Azure Tags (all resources, every deployment)

```
customer:    {slug}
environment: production | validation
managed-by:  sales-prism-provisioning
model-tier:  standard | professional | enterprise
```

## Design System (finalized — SAD decisions log supersedes SAD §11 palette)

- Primary: Copper Fjord `#B86A4B` · Secondary: Nordic Moss `#5E6B5B` · Tertiary: Fjord Teal `#258D85` · Neutral: Warm Stone `#807571`
- AI answers = document blocks (warm sand `#F0EDE6`, copper left border), NOT chat bubbles
- Typography: Playfair Display (display) / DM Sans (body) / DM Mono (labels)
- Source of truth: `DESIGN.md` (regenerated from Stitch project "Sales Coaching Conversation View") + SAD decisions log rows

## Key Directories

- `infra/` — Bicep modules (**never modify without explicit discussion**)
- `.github/workflows/` — Provisioning workflows (**never modify without explicit discussion**)
- `src/app/(authenticated)/api/chat/` — AI streaming route (streamText, AI SDK v6)
- `src/features/chat-page/chat-services/` — migration target (Phase C Sprint 1)
- `src/features/auth/` — Entra ID auth (**OFF LIMITS — never modify**)
- `.claude/agents/` — Subagent definitions (canonical; `.codex/agents/` mirrors for Codex)
- `docs/` — governing docs, ADRs, audit, traceability, evidence

## Current State (verified 2026-07-30 — do not trust older claims)

- Fork exists with Next 15 / AI SDK v6 packages; chat route migration had 1 tsc error (fixed in Stage 2b)
- `infra/modules/` Bicep modules exist (SP-B01 commit) — verified by lint/what-if in Stage 3a, not by prior claims
- `provision-customer.yml` does NOT exist yet (Stage 3c)
- `sales-prism.com` was never registered; platform runs on `pixelflow.dk`
- Fable 5 was never suspended — the contrary decisions-log entry in SAD v2.7 is false and corrected
- Execution state: `.claude/session-state.json` + `.claude/resume.md`

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
| `pre-merge-reviewer` | Final quality gate before any merge |

Lead (Fable 5) owns task graph, file ownership, integration, acceptance. Workers: Sonnet. Haiku only for bounded inventory/validation.

## Off-Limits (requires explicit approval from Kristjan before touching)

- `.github/workflows/provision-customer.yml` once created — changes need review
- `src/features/auth/` — Entra ID authentication
- Any `.bicepparam` file in production environments
- Any file containing CONNECTION_STRING, KEY, or SECRET in the name
- Existing Cloudflare DNS records; repository visibility; production deployments before validation gates pass

## Known Gotchas

- GPT-4.x family is Deprecated on Azure — cannot be deployed by this subscription (ADR-001)
- DataZoneStandard quota: only gpt-5.4-mini + text-embedding-3-small granted (westeurope) — Pro/Enterprise tiers quota-gated
- Cosmos DB free tier: max 1 per subscription — customers need serverless tier
- Key Vault soft-delete: 90 days — offboarding must account for slug reuse delay
- Cloudflare Origin Certificate is PEM — MUST convert to PFX for App Service
- Node 22 must be set in BOTH App Service Bicep AND GitHub Actions — not just one
- Next.js 15 + React 19: Radix UI requires `--legacy-peer-deps` during install
- TXT verification records for custom domain MUST have `proxied: false`
- Universal SSL covers one subdomain level only — hence `{slug}-sales360.pixelflow.dk` (flat), never nested
- Entra App Registration needs `Application.ReadWrite.OwnedBy` Graph permission

## Test Rules

- Tests MUST fail if the feature they test is malfunctioning
- Tests must NEVER patch the application to make themselves pass
- Tests must NEVER modify application code to make tests green
