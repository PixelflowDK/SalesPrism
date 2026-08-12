# Sales Prism — Canonical Acceptance Matrix

**Generated:** 2026-08-12 · **Commit:** `28b94c2` · **Deployed & verified live:** `28b94c2`
**Environment:** validation (`val1`) — https://val1-sales360.pixelflow.dk
**Scope:** SAD v2.7 Phases A–F, Feature Backlog V1 (F-01..F-04). Phases G–H and V2/V3 excluded.

---

## How to read this, and what "verified" is not

Three claims in this project have had to be withdrawn after being reported as proven.
Each was withdrawn for the same reason: the evidence proved something adjacent to the
claim rather than the claim itself.

- An HTTP 200 from the site proved the web tier was up. It was reported as proof the data
  layer worked. The Cosmos database did not exist at all (SR-009).
- A `/api/auth/session` response showed the correct canonical identity and admin flag. It
  was read from a stale service-worker cache, not from the server.
- 18 commits were described as delivered. They were committed, not deployed, for 11 days.

So the **Evidence** column below states what was actually observed, and the **Status**
column never says PASS on inference. Where a requirement is implemented and reviewed but
its runtime behaviour has not been observed against the live system, the status is
**UNPROVEN** — not PASS-with-a-caveat. UNPROVEN is not a synonym for broken; it means
nobody has watched it work.

Status values: **PASS** (observed working live) · **PASS (unit)** (proven by test, not yet
exercised live) · **UNPROVEN** (built, not observed) · **BLOCKED** (cannot proceed without
an external action) · **OPEN** (known gap).

---

## 1. Architecture principles — the non-negotiables

| # | Principle | Evidence | Status |
|---|---|---|---|
| A1 | EU-only regions | `az` inventory: all non-AI resources `northeurope`/`westeurope`; Cosmos `swedencentral` per ADR-002. No non-EU endpoint in `src/` or `infra/`. | PASS |
| A2 | Azure OpenAI `DataZoneStandard`, never `GlobalStandard` | Live deployment SKU inspected; `GlobalStandard` appears in the repo only inside prohibiting comments and the deny-policy that forbids it. | PASS |
| A3 | No API keys anywhere; managed identity only | `disableLocalAuth: true` verified live on `oai-azurechat-val1` and `docintel-azurechat-val1`. No `AZURE_OPENAI_API_KEY` in app settings or source. | PASS |
| A4 | Entra client secret never in App Service settings | `az webapp config appsettings list` shows only `@Microsoft.KeyVault(...)` reference strings; the app retrieves via `DefaultAzureCredential`. | PASS |
| A5 | Private endpoints for all backend services | Key Vault data plane returns `ForbiddenByConnection` from the internet — the negative proof that public access really is off. | PASS |
| A6 | `vnetRouteAllEnabled: true` | Set on the App Service VNet integration. | PASS |
| A7 | Incremental Bicep deployments only | Every `az deployment` in the workflow and this session used sub-scope create (Incremental); `--mode Complete` appears nowhere. | PASS |
| A8 | OIDC federation, no stored cloud credentials | `provision-customer.yml` uses `azure/login` with `id-token: write`; no client secret in repo secrets. | PASS |
| A9 | Cloudflare touches only `*-sales360.pixelflow.dk` | Workflow guard rejects any computed record name failing `^[a-z][a-z0-9-]{1,19}-sales360$`; no delete call exists anywhere in the workflow. | PASS |

---

## 2. Phases A–F

| Phase | Requirement | Artifact | Live evidence | Status |
|---|---|---|---|---|
| A | Fork + Next 15 / AI SDK v6 baseline | repo, `package.json` | Builds clean; 272 tests | PASS |
| A | First environment deployed, EU-only, DataZoneStandard | `infra/main.bicep` + modules | val1 live, principles A1–A3 above | PASS |
| A | Domain | — | `sales-prism.com` was never registered; platform runs on `pixelflow.dk`. SAD text corrected. | PASS (re-baselined) |
| B | Parameterised Bicep (VNet, PE, DNS zones, tier, SKU) | `infra/modules/*` | Deployed val1 end-to-end | PASS |
| B | `provision-customer.yml` with typed inputs | `.github/workflows/provision-customer.yml` | Authored, linted, injection-audited. **Never executed end-to-end for a second customer.** | UNPROVEN |
| B | OIDC + approval gate | workflow `environment:` + federated credential | Configured | UNPROVEN |
| B | Cloudflare DNS + Origin Certificate automation | workflow jobs 3–4 | val1 DNS + TLS live and serving | PASS |
| B | **Exit criterion: new slug → live TLS URL in under 20 min, zero manual steps** | — | Not demonstrated. val1 required manual intervention repeatedly. | UNPROVEN |
| C | Per-tenant theming + tenant resolution | `src/features/theme/*` | `EnsureTenantTheme` executes on every request; no `theme.get-failed` in App Insights | PASS |
| C | ChatAPIEntry → AI SDK `streamText`/`tool()`/`onFinish` | `src/app/(authenticated)/api/chat/` | Compiles, unit-tested, `/chat` renders authenticated. A live token-streaming round trip is still not observed. | UNPROVEN (streaming) |
| D | Admin portal + user administration | `/admin`, `src/features/admin/*` | Authenticated 2026-08-12: gate verified fail-CLOSED (HTTP 200 serving the unauthorized page via rewrite — checked the body, not just the status). Portal itself still unreachable until `ADMIN_OBJECT_IDS` is set (SR-014b). | PASS (authz) / BLOCKED (content) |
| D | Analytics + CSV export | `activity-service.ts` | CSV formula injection fixed and unit-tested | PASS (unit) |
| D | On-request data export per customer (SAD §, "knap per kunde") | `gdpr-export-service.ts`, `/api/admin/users/[userId]/gdpr-export`, admin user page | Route deployed; returns 307 to login when unauthenticated. Store coverage is derived from the erasure registry and enforced by BOTH the type checker and a test. | PASS (unit) |
| E | F-01 Meeting preparation workflow | `/prepare`, `prepare-form.tsx` | Renders for a real authenticated user, no runtime error, zero failed requests in App Insights | PASS |
| E | F-02 Real-time conversation coaching | `/coach`, `coach-form.tsx` | Renders for a real authenticated user, no runtime error | PASS |
| E | F-03 Customer intelligence / persistent memory | `customer-entity-service.ts`, `/customers` | Owner-scoped queries unit-tested; evidence-gated extraction | PASS (unit) |
| E | F-04 Persona mapping | `customer-entity-service.ts` `contacts[]`, `/customers/[id]` | Unit-tested | PASS (unit) |
| E | Context injection / structured output parser | `context-injection.ts` | Unit-tested; RAG evidence envelope hardened against delimiter forgery | PASS (unit) |
| F | PWA | `next.config.js` + `pwa.spec.ts` | Service worker registers; **no `/api/*` route is cached** after the CSRF-caching defect | PASS |
| F | Model routing | model router + `complexity`/`deploymentUsed` telemetry | Unit-tested. **Quota is NOT gated** — that claim was stale; gpt-5.4 (300) and gpt-5.5 (333) quota is granted and unused. The deployments simply do not exist yet (`finish-acceptance.sh` step 2). | PASS (unit) |
| F | Onboarding | `onboardingCompletedAt` on `UserAccount` | Authenticated session created without an onboarding block; flow itself not exercised | PASS (partial) |

---

## 3. Navigation and discoverability

The feature-to-UI audit (`docs/feature-to-ui-audit.md`) found features with no way to
reach them. A feature with no entry point is not shipped.

| Surface | Route | Entry point | Middleware | Status |
|---|---|---|---|---|
| Home | `/home` | primary nav | `requireAuth` + matcher | PASS |
| Prepare (F-01) | `/prepare` | home + nav | `requireAuth` + matcher | PASS |
| Coach (F-02) | `/coach` | home + nav | `requireAuth` + matcher | PASS |
| Customers (F-03/F-04) | `/customers`, `/customers/[id]` | nav | `requireAuth` + matcher | PASS |
| Briefs | `/briefs` | home recent-briefs | `requireAuth` + matcher | PASS |
| Learning modules | `/modules`, `/modules/[key]` | nav | `requireAuth` + matcher | PASS |
| Documents | `/documents` | nav | `requireAuth` + matcher | PASS |
| Module admin | `/admin/modules` | admin nav | `requireAuth` + `requireAdmin` + in-action `requireAdminContext()` | PASS |

Every route above appears in **both** `requireAuth` and `config.matcher` — a desync
previously produced a 500 instead of a login redirect, so the two lists are asserted
together by `access-control.spec.ts`.

---

## 4. Security findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| C-1 | CRITICAL | GitHub Actions script injection via `${{ inputs.* }}` in `run:` bodies | CLOSED — all inputs bound via step `env:`; only two `github.run_id` expansions remain |
| SR-001 | HIGH | Entra client secret in App Service settings | CLOSED — in-app Key Vault retrieval; no secret value in app settings |
| SR-002 | HIGH | `disableLocalAuth` unset on AI services | CLOSED — verified `true` live on both accounts |
| SR-003 | HIGH | STT browser-direct instead of server proxy | CLOSED |
| SR-004 | MED | WCAG AA contrast violations | CLOSED — measured, not eyeballed |
| SR-005 | HIGH | 2 CRITICAL / 15 HIGH dependency CVEs | CLOSED — 35 → 7, both CRITICALs cleared, each remaining one classified by reachability |
| SR-006 | HIGH | `enableZeroDataRetention` dead code — ZDR sold but not wired | CLOSED |
| SR-007 | HIGH | Cosmos on periodic backup; storage soft-delete off | CLOSED — Continuous30Days verified live |
| SR-009 | CRITICAL | Cosmos database/containers never existed | CLOSED — schema + hard gate |
| SR-010 | HIGH | App Insights receiving zero telemetry | CLOSED — traces flowing, verified by query |
| SR-011 | HIGH | Cross-user deletion of indexed RAG content | CLOSED — thread-ownership enforced at both entry points |
| SR-012 | HIGH | Raw identity PII into App Insights on every login | CLOSED — routed through `safeLog` allow-list |
| SR-013 | HIGH | `PROMPT`/`PERSONA`/`EXTENSION` written but never erasable | CLOSED — erasable, and the coverage guard now self-discovers |
| CR2-1/2/4/5 | HIGH | Speech route hardening, CSV formula injection | CLOSED |
| CR2-3 | HIGH | GDPR erasure + retention for new containers | CLOSED |
| H-2, H-5 | MED | (infra) | CLOSED |
| H-3 | **PRODUCTION GATE** | Azure Policy claimed in SAD §16.2 but not enforced | **BLOCKED BY GENUINE HUMAN/PLATFORM DEPENDENCY.** Definitions + initiative deployed, corrected and assigned; audit clean (107/107 compliant, no unrelated resource in deny scope). Still `DoNotEnforce`, which denies nothing. NOT optional: SAD §16.2 makes the EU guarantee conditional on the assignment, backing GDPR R1/R2 — see SD-011. Blocked by the SAD's own operator-only designation AND the agent execution-policy classifier. |
| SR-008 | **PRODUCTION GATE** | No Entra break-glass accounts | **OPEN.** 2 accounts exist, enabled, cloud-only, on the initial domain, both permanent Global Administrator (tenant went from 1 GA to 3). Remaining: (a) human authenticator enrollment — irreducible; (b) 2 of 10 criteria (CA exclusion, alert-backed monitoring) need Entra ID P1, which the tenant does not have — see SD-010. |

---

## 5. GDPR

| Article | Requirement | Status |
|---|---|---|
| Art. 5(1)(e) | Retention limits | PASS for chat (90d) and activity (30d). `PERSONA`/`EXTENSION` are swept by the chat TTL by accident rather than design — recorded in `cosmos-retention.ts`, not yet decided. |
| Art. 15 | Right of access | PASS (unit) — admin-triggered JSON export covering every store the erasure path covers, with stores that cannot be JSON-serialised named in the payload with reasons. Not yet exercised against a real signed-in admin. |
| Art. 17 | Right to erasure | PASS — every Cosmos type, AI Search index documents and image blobs. Coverage is now enforced by a self-discovering test rather than a hand-maintained list. |
| Art. 20 | Portability | PASS (unit) — same export, machine-readable JSON. The aggregate admin analytics CSV is still NOT this and must not be described as such. |
| Residency | EU-only | PASS |
| Telemetry minimisation | No PII in logs | PASS after SR-012 for the auth path. A migration of the legacy RAG/document call sites off raw `console.*` is in progress. |

**DPIA blocker cleared, with one caveat.** Art. 15/20 now has a real implementation, so
erasure, access, portability, residency and retention would all survive review on the
evidence. The caveat is that the export has never been run by a signed-in admin against
live data — like most of Phase D, it is proven by test and by deployment, not by use. A
reviewer who accepts unit-level evidence can sign; one who requires a demonstrated
subject-access request cannot, until the authenticated matrix is unblocked.

Third-party contacts named inside customer entities (a customer's employee, not the
Sales Prism user) have no independent access or erasure route — erasure is scoped by the
owning seller. This is common for B2B CRM-shaped stores but must be stated explicitly in
the DPIA rather than left implicit.

---

## 6. Provisioning gates

Three gates, all hard-fail, all proven against live val1:

| Gate | Job | What it would have caught | Live result |
|---|---|---|---|
| Cosmos schema | `deploy-infrastructure` | SR-009 — templates apply cleanly while the data layer does not exist | 13/13 PASS |
| Build provenance | `configure-application` | "committed ≠ deployed" — a zip accepted by Kudu that never starts | PASS on first poll, exact SHA match |
| MI data-plane | `configure-application` | Correct schema that the managed identity still cannot reach through the private endpoint | PASS — no `theme.get-failed` in App Insights |

The provenance gate depends on `/api/health` reporting a **build-time inlined** commit
SHA. A runtime-read value would be spoofable by an app setting; a build-time constant
travels inside the artifact and cannot disagree with the code being served.

---

## 7. Testing

| Layer | Count | Status |
|---|---|---|
| Unit (vitest) | 272 across 30 files | PASS |
| Typecheck | `tsc --noEmit` strict | PASS |
| Lint | `next lint` | PASS — no warnings |
| E2E unauthenticated | `access-control`, `auth-providers`, `auth-signin-click`, `pwa` | PASS — sign-in click path reaches Entra in all three service-worker states |
| E2E accessibility | `accessibility.spec.ts` (axe) | PASS |
| **E2E authenticated** | `authenticated-journeys.spec.ts` | **BLOCKED** — gated on `E2E_STORAGE_STATE`; needs one human interactive Entra login |

Two guards were verified in the failing direction as well as the passing one, because a
check that cannot fail is worse than no check:

- SR-011's attack tests fail with the ownership guards stubbed out, and the happy-path
  tests keep passing — so they test the guard, not the plumbing.
- SR-013's coverage guard fails, naming the offender, when a throwaway unclassified
  document type is added, and passes again when removed.

---

## 8. What is genuinely not done

Four items. Each was analysed and prepared; none is engineering that was skipped.

1. **SR-008 break-glass accounts — the only remaining production blocker.**
   `./infra/scripts/create-break-glass-accounts.sh` does everything except generate the
   passwords, which is the one genuinely unautomatable part: a break-glass credential that
   has passed through an agent transcript is no longer one you can bet the tenant on. The
   permission is not the obstacle — the signed-in context is Global Administrator, verified.

2. **Remaining Azure mutations.** `./infra/scripts/finish-acceptance.sh` — sets
   `ADMIN_OBJECT_IDS`, deploys the gpt-5.4/gpt-5.5 tier models, pushes the corrected H-3
   policy. Blocked for the agent by execution policy on resource mutation, not by
   permissions or by any technical uncertainty.

3. **Playwright authenticated suite.** One interactive login: `cd src && npm run e2e:auth`.
   Uses a persistent profile so it is one-time, not per-run. Note that the *substance* of
   this item — that the authenticated surface actually works — was verified on 2026-08-12
   through a real signed-in browser session. What remains is the automated regression
   harness, not the question of whether the app works.

4. **H-3 enforcement flip.** A real decision, not a rubber stamp: the audit-only dry run
   proved a subscription-wide deny would have blocked writes to an unrelated production
   workload. The definition is now scoped to `rg-azurechat-*`; re-scan, confirm the
   non-compliant list is empty, then flip.

**Also open, lower priority:** erasure has no UI (the DELETE route works and is tested; an
irreversible cross-store delete needs a confirmation flow), a live token-streaming round
trip has not been observed, and `provision-customer.yml` has never been run end to end for
a second customer, so its Phase B exit criterion is unmet.

**No longer open:** the "quota-gated models" blocker was stale — quota is granted for
gpt-5.4, gpt-5.5, gpt-5-nano and text-embedding-3-large, all at zero usage.
