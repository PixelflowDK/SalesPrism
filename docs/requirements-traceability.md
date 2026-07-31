# Requirements Traceability Matrix

**Purpose:** Map each requirement/acceptance criterion to its source, implementation task, expected artifact, and test. Status is tracked per row; update as work lands. This is a skeleton — all rows start "Not started" except verified environment items already covered in `docs/project-audit.md`.

| Requirement | Source | Implementation task | Artifact | Test | Status |
|---|---|---|---|---|---|
| R1 — All Azure resources in northeurope/westeurope | SAD §2.3 | Stage 3a Bicep param defaults | `infra/modules/*.bicep` region params | `az deployment what-if` region check | Not started |
| R2 — Azure OpenAI DataZoneStandard only, never GlobalStandard | SAD §2.3 / ADR-001 | Stage 2b OpenAI module SKU fix | `infra/modules/openai.bicep` | Bicep lint + what-if SKU assertion | Not started |
| R3 — No API keys/secrets stored anywhere | SAD §2.3 | Stage 2a managed identity wiring | App Service settings, Key Vault RBAC | `az webapp config appsettings list` grep for keys | Not started |
| R4 — Full per-customer resource isolation | SAD §2.3 | Stage 3a per-slug resource group | `rg-azurechat-{slug}` | Resource graph query — no shared resources | Not started |
| R5 — Provisioning fully automated via GitHub Actions + OIDC | SAD §2.3 | Stage 3c `provision-customer.yml` | `.github/workflows/provision-customer.yml` | End-to-end provisioning dry run | Not started |
| R6 — White-label with customer brand incl. dark mode | SAD §2.3 | Phase C theming | `TenantTheme` Cosmos schema, `ThemeProvider` | Visual regression per theme | Not started |
| R7 — Private network (VNet + Private Endpoints) from day 1 | SAD §2.3 | Stage 3a networking module | `infra/modules/network.bicep` | Private endpoint connectivity test | Not started |
| R8 — AI model configurable per customer tier | SAD §2.3 / ADR-001 | Stage 2b model-tier param | Bicep `modelTier` param, admin portal selector | Deploy each tier, verify model bound | Not started |
| Phase A exit — Test customer can log in, chat via AI SDK v6 streaming, upload doc; DataZoneStandard confirmed; no API keys | SAD §18 Phase A | Stage 1-2 foundation work | First `azd up` deployment | Manual smoke test + config grep | Not started |
| Phase B exit — New slug fully deployed with TLS in under 20 minutes, zero manual steps | SAD §18 Phase B | Stage 3 provisioning workflow | `provision-customer.yml` run log | Timed E2E provisioning run | Not started |
| Phase C exit — Chat works with Cosmos DB history + RAG via AI SDK; two branded deployments in light/dark; Node 22 confirmed | SAD §18 Phase C | Phase C service migration | `chat-handler.ts`, theme configs | Playwright smoke per tenant | Not started |
| Phase D exit — Full customer lifecycle manageable from portal; customer-admin can manage users and view stats | SAD §18 Phase D | Phase D admin portal build | Admin portal Next.js app | Playwright admin flows | Not started |
| Phase E exit — Seller can prep a meeting, receive coaching feedback, view stakeholder profile — all methodology-grounded | SAD §18 Phase E | Phase E F-01–F-04 build | Meeting-prep flow, coaching flow, entity/persona services | Feature acceptance tests (see F-01–F-04 rows) | Not started |
| Phase F exit — Platform installable as PWA; onboarding under 3 min; model routing logs correct model choice | SAD §18 Phase F | Phase F PWA + routing | Service worker config, routing layer logs | PWA install test, onboarding timing test | Not started |
| F-01 AC — User can start meeting prep with one prompt | Backlog F-01 | Phase E | Meeting-prep entry point | E2E prompt-to-brief test | Not started |
| F-01 AC — Platform asks at least 4 guiding questions | Backlog F-01 | Phase E | Guided-flow prompt sequence | Transcript assertion (≥4 questions) | Not started |
| F-01 AC — Output includes concrete 2nd Position questions | Backlog F-01 | Phase E | Brief output schema | Output content assertion | Not started |
| F-01 AC — Brief can be saved and reopened | Backlog F-01 | Phase E | Cosmos DB brief persistence | Save/reload round-trip test | Not started |
| F-01 AC — Works on mobile (PWA) | Backlog F-01 | Phase E / F | Responsive UI + PWA shell | Mobile viewport Playwright test | Not started |
| F-02 AC — Platform identifies 1st vs 2nd Position communication | Backlog F-02 | Phase E | Coaching classifier | Labeled-transcript accuracy test | Not started |
| F-02 AC — Feedback is specific and actionable | Backlog F-02 | Phase E | Coaching response generator | Manual/LLM-judge review | Not started |
| F-02 AC — Concrete alternative phrasing suggested | Backlog F-02 | Phase E | Coaching response generator | Output content assertion | Not started |
| F-02 AC — Linked to relevant Sales Coach model | Backlog F-02 | Phase E | Model-tagging in response | Output tag assertion | Not started |
| F-03 AC — Platform remembers customers across sessions | Backlog F-03 | Phase E | Customer Entity Service (Cosmos DB) | Cross-session recall test | Not started |
| F-03 AC — New customer info saved automatically | Backlog F-03 | Phase E | `onFinish` auto-extraction | Extraction unit test | Not started |
| F-03 AC — Customer context used proactively in meeting prep | Backlog F-03 | Phase E | Context injection in F-01 flow | Integration test F-01+F-03 | Not started |
| F-03 AC — Seller can view and edit customer profile | Backlog F-03 | Phase E | Customer profile UI | Playwright CRUD test | Not started |
| F-04 AC — Persona profiles created automatically from conversation history | Backlog F-04 | Phase E | Persona extraction service | Extraction unit test | Not started |
| F-04 AC — Personas classified in Sales Coach terminology | Backlog F-04 | Phase E | Persona classifier | Classification accuracy test | Not started |
| F-04 AC — Concrete communication recommendations generated | Backlog F-04 | Phase E | Persona recommendation generator | Output content assertion | Not started |
| F-04 AC — Profiles updated continuously with new information | Backlog F-04 | Phase E | Persona update pipeline | Incremental-update test | Not started |
| Dual auth model — Entra ID SSO or Username/Password (either/or at onboarding) | SAD §8.1 | Phase D | Auth method selector in provisioning | Onboarding flow test both paths | Not started |
| Auth Method A — Entra ID SSO | SAD §8.2 | Phase A/D | Entra ID app registration | SSO login E2E test | Not started |
| Auth Method B — Username/Password via Entra External ID CIAM | SAD §8.3 | Phase D | CIAM tenant config | Username/password login E2E test | Not started |
| User groups — flexible tag-system, customer-defined dimensions | SAD §8.4 | Phase D | Tag-dimension admin UI | Tag CRUD + filter test | Not started |
| Customer-admin UI — user CRUD, password reset, group management | SAD §8.5 | Phase D | `/admin` route in chat app | Playwright admin CRUD test | Not started |
| User analytics — toggle-based, per-tier default | SAD §8.6 | Phase D | `features.userAnalytics` toggle + dashboard | Toggle on/off behavior test | Not started |
| Platform tiering — SMB/Professional vs Enterprise (white-label) | SAD §10.1 | Phase C/D | Tier config in TenantTheme | Tier-gated feature test | Not started |
| White-label theming architecture | SAD §10.2 | Phase C | `TenantTheme` interface + ThemeProvider | Multi-tenant visual test | Not started |
| Dark mode support | SAD §10.4 | Phase C | Theme CSS variables (light/dark) | Dark mode toggle visual test | Not started |
| Observability — per-customer telemetry isolation | SAD §31.1 | Stage 3a | App Insights + Log Analytics per RG | RBAC isolation audit | Not started |
| Observability — standard alerting baseline (7 alerts) | SAD §31.2 | Stage 3a | Bicep alert rules | Alert-fires-on-threshold test | Not started |
| Observability — PII minimization in telemetry | SAD §31.3 | Stage 3a/Phase C | Telemetry initializer (hash/redact) | Telemetry payload PII scan | Not started |
| Observability — distributed tracing across requests | SAD §31.5 | Phase C | App Insights correlation | Trace continuity test | Not started |
| GDPR — right to erasure ("forget user X"), Art. 17 | SAD §32.3 | GDPR data-lifecycle task (2026-07-31) | `src/features/admin/gdpr-erasure-service.ts` (`EraseDataSubject`), `DELETE /api/admin/users/[userId]/gdpr-erase` | `gdpr-erasure-service.test.ts` (store-coverage registry, tenant/subject scoping, audit-record PII check) | Implemented — covers Cosmos (chat threads/messages/documents/citations, customer entities, meeting briefs, activity events, anonymized user account), AI Search index (`DeleteDocumentsByUser`), and blob storage (`DeleteBlobsWithPrefix`). SAD §32.3's "embeddings cannot be deleted per user" claim does NOT hold for this implementation — see gdpr-erasure-service.ts module doc. Entra External ID account deletion (SAD §32.3 step 3) is NOT implemented — no Graph client exists in this repo and `auth-page/` is read-only; see `docs/known-limitations.md` |
| GDPR — right to data portability, Art. 20 | SAD §32.3 | Phase D | Admin portal data export (§15.4) | Export completeness test | Not started |
| GDPR — right of access, Art. 15 | SAD §32.3 | Phase D | In-app chat history view + admin export | Access request E2E test | Not started |
| GDPR — retention TTL (chat/documents 90d, activity logs 30d) | SAD §32.1 | GDPR data-lifecycle task (2026-07-31) | `src/features/common/services/cosmos-retention.ts` (`EnsureContainerRetentionPolicies`), `ActivityEvent.ttl`, `infra/modules/storage.bicep` blob lifecycle policy | `cosmos-retention.test.ts` (TTL constants match SAD table, container defaultTtl applied/idempotent) | Implemented for Cosmos (`HistoryContainer` container-wide `defaultTtl`=90d; `ConfigContainer` per-document `ttl` on `ActivityEvent`=30d, config docs never expire) and Storage (`images` blob container, 90-day lifecycle rule). AI Search has no native per-document TTL — a blanket 90-day sweep of the index is NOT implemented (erasure-on-request is); see `docs/known-limitations.md` |
| STT — Azure AI Speech real-time streaming, proxied via Next.js API route | SAD Decisions Log / F-02 | Phase E | `/api/speech` proxy route | Proxy-never-direct-to-Azure audit | Not started |
| STT post-processing — GPT model cleans and categorizes transcript | SAD Decisions Log / F-02 | Phase E | Post-processing pipeline (model per ADR-001) | Categorization accuracy test | Not started |
