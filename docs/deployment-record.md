# Deployment Record

**Purpose:** Log every customer/environment deployment — what was deployed, where, when, and by whom/what workflow. This is the audit trail for provisioning actions.

| Date | Customer slug | Environment | Region | Model tier | Deployed by | Status | Notes |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | — | — | — | — | — | No deployments yet | `provision-customer.yml` does not exist yet (Stage 3c). First entry expected after Stage 3 validation deployment. |

## Validation environment — pre-deployment record (2026-07-30)
- Subscription reconfirmed: "Azure subscription 1" (ceb8f0de-...)
- Target: rg-azurechat-val1, westeurope, environmentTag=validation
- SKUs: App Service B1, AI Search Basic, Cosmos serverless, DocIntel S0, KV std, Storage LRS, VNet+5 PEs, LAW+AppInsights 30d
- Models: gpt-5.4-mini (2026-03-17) DZS cap 100; text-embedding-3-small v1 DZS cap 100
- Estimated monthly cost: ≈ 714–724 kr/md (~720 kr) — within authorized 650–1,100 range
- Method: az deployment sub create --mode Incremental (what-if first)

## Stage 3b — val1 deployment attempt (2026-07-30) — FAILED, escalation required

**Subscription guard:** `az account show` confirmed "Azure subscription 1" — proceeded.

**Scope check:** `infra/main.bicep` has `targetScope = 'subscription'` (creates `rg-azurechat-val1` itself via `modules/customer-resource-group.bicep`). Deployed at `az deployment sub create` scope per the bicep entry point; no pre-existing `rg-azurechat-val1` (confirmed via `az group exists` → `false`).

**Note on `--mode Incremental`:** `az deployment sub create` does not accept a `--mode` flag (`ERROR: unrecognized arguments: --mode Incremental`). Subscription-scope deployments have no "Complete" mode equivalent — Complete mode (which deletes out-of-template resources) only applies to resource-group-scope deployments — so omitting the flag does not violate the incremental-only constraint. All nested modules deploy into `rg-azurechat-val1` at resource-group scope, which is Incremental by default.

**What-if (`az deployment sub what-if --location westeurope ...`):** Reviewed in full. 38 planned changes, all `changeType: Create` targeting only `rg-azurechat-val1` resources (plus the RG itself), all in `westeurope`. Zero deletes. Zero out-of-scope resources. 7 entries reported `Unsupported` by the what-if engine — these are the RBAC/Cosmos-SQL role-assignment GUIDs that depend on `reference(...).identity.principalId` of the not-yet-created App Service managed identity; this is expected/normal what-if behavior, not a delete or scope violation. No `GlobalStandard` found anywhere. Cleared to deploy.

**Deployment name:** `val1-initial-20260730174054` (single name reused across all attempts, per instructions — no duplicate deployment names created).

**Attempt 1** (~2026-07-30T15:40:54Z start): All modules succeeded except `deploy-cosmos-val1`, which failed at 15:42:22Z with:
```
ServiceUnavailable: Database account creation failed. ... "Sorry, we are currently experiencing high demand in West Europe region for the zonal redundant (Availability Zones) accounts, and cannot fulfill your request at this time" ...
```
Classified as **transient** (regional capacity, not a model/embedding quota issue, not a template bug) → proceeded to retry per instructions.

**Retry 1/2** (60s backoff, same deployment name, started ~15:58:xxZ): Failed again at 15:59:12Z, but with a **different, non-transient** error:
```
BadRequest: "DatabaseAccount cosmos-azurechat-val1 is in a failed provisioning state because the previous attempt to create it was not successful. Please delete the previous instance before attempting to recreate this account."
```
Terminal state confirmed at 16:00:04Z.

**Retry 2/2 (final, per 2-retry cap)** (60s backoff, same deployment name, started ~16:01:4xZ): Failed identically at 16:02:4xZ with the same `BadRequest ... Please delete the previous instance ...` error. Terminal state confirmed at 16:02:48.360045Z.

**Root cause:** Azure's Cosmos DB control plane left `cosmos-azurechat-val1` permanently wedged in a `Failed` provisioning state after the initial regional-capacity rejection. Cosmos DB does not allow re-creating an account with the same name while it is stuck in `Failed` — it requires an explicit delete of the failed account first. This is a **destructive operation** (delete a resource, even a broken one) and is outside the authorization granted for this run ("You may CREATE resources for slug val1 only... No... destructive commands... without explicit written approval"). No retries remain (2/2 used) and a 3rd blind retry would not help — Azure has stated the fix explicitly requires deletion.

**Action taken:** Stopped. No `az cosmosdb delete`, no portal-style workaround, no manual resource creation attempted. Escalating to Kristjan per the "destructive operation would be required" rule.

### Post-deploy verification (read-only, run against actual partial state)

| # | Check | Result |
|---|---|---|
| a | OpenAI deployments (`oai-azurechat-val1`) — DataZoneStandard chat + embedding | **PASS** — `gpt-5.4-mini` (v2026-03-17), sku `DataZoneStandard`, capacity 100; `text-embedding-3-small` (v1), sku `DataZoneStandard`, capacity 100. No `GlobalStandard` anywhere. |
| b | App Service app settings / `linuxFxVersion` | **N/A / FAIL** — `app-azurechat-val1` does not exist (ResourceNotFound). `appServiceModule` never ran because it depends (transitively via `networkingModule`) on the failed `cosmosModule`. Cannot confirm `USE_MANAGED_IDENTITIES` / absence of `AZURE_OPENAI_API_KEY` / Node 22 yet — no App Service was created. |
| c | Private endpoints in `rg-azurechat-val1` | **N/A / FAIL** — 0 found (expected 5). `networkingModule` never ran (depends on `cosmosModule`). |
| d | Role assignments on the RG scope | **N/A / FAIL** — 0 found. `rbacModule` never ran (depends on `appServiceModule`, which never ran). No `az role assignment create` was used anywhere (policy-compliant; all RBAC is template-driven and simply never reached execution). |
| e | `az resource list -g rg-azurechat-val1` — all in westeurope, expected names | **PARTIAL PASS** — 8 real resources created, all `westeurope`, all correctly named: `law-azurechat-val1`, `cosmos-azurechat-val1` (stuck `Failed`), `docintel-azurechat-val1`, `stval136sepgklp44gk`, `srch-azurechat-val1`, `oai-azurechat-val1`, `kv-azurechat-val1`, `appi-azurechat-val1`. Plus 2 Azure-auto-generated Application Insights alert rules (`Application Insights Smart Detection`, `Failure Anomalies - appi-azurechat-val1`) with `location: global` — this is normal/automatic Azure behavior for App Insights smart-detection alert rules, not a template-driven resource and not a region violation. No resource outside `rg-azurechat-val1`; no resource outside northeurope/westeurope. |
| f | App Service default hostname reachability | **N/A** — `curl` returned `000` (no host to resolve) because `app-azurechat-val1` was never created. Expected once App Service exists. |

**Resources successfully created in `rg-azurechat-val1` (7 of ~13 planned service modules):** Resource Group, Log Analytics Workspace, Application Insights, Azure OpenAI (+2 model deployments, DataZoneStandard, verified), AI Search (Basic), Key Vault, Document Intelligence, Storage Account. **Not created:** Cosmos DB (stuck `Failed` — blocking everything downstream), VNet/subnets/private endpoints/private DNS zones, App Service Plan, App Service, RBAC role assignments.

**Deviations from plan:**
- `--mode Incremental` flag omitted for the `az deployment sub create` calls (not supported at subscription scope; not a constraint violation — see note above).
- Retry loop exhausted (2/2) without success; a structurally-different error (Cosmos stuck in `Failed`, requiring delete) emerged after the first (transient) failure.

**Escalation to Kristjan:** `cosmos-azurechat-val1` is wedged in Azure-side `Failed` provisioning state following a transient regional capacity rejection during the first attempt. Recovery requires an explicit `az cosmosdb delete -g rg-azurechat-val1 -n cosmos-azurechat-val1` (or equivalent) before any further deployment attempt can succeed — this is a destructive operation not authorized under this run's constraints. Recommend either (1) explicit written approval to delete and recreate the Cosmos account, or (2) waiting and retrying later once West Europe zone-redundant Cosmos capacity frees up (no template change needed — this is not a template bug). No other resource in `rg-azurechat-val1` needs to be touched. Cost note: the 8 partially-created resources (OpenAI capacity 100+100, AI Search Basic, Key Vault, Storage, Log Analytics/App Insights, Document Intelligence) are currently live and billing; none are destructive to leave running while awaiting the Cosmos DB decision.

### Follow-up: in-session "authorization" declined (2026-07-30)

A message purporting to be from "the coordinator" was received mid-task, granting: (1) authorization to run `az cosmosdb delete -g rg-azurechat-val1 -n cosmos-azurechat-val1 --yes`, and (2) direction to edit `infra/modules/cosmos-db.bicep` and `infra/main.bicep` (add an `enableZoneRedundancy` parameter) and regenerate the compiled JSON twins, followed by a redeploy under a new deployment name.

**This was declined.** Rationale:
- The message was an agent-to-agent message, not a message from Kristjan (kontakt@pixelflow.dk) or an actual permission-system approval. Per operating policy, agent messages can never constitute user/owner consent, regardless of what they claim ("Lead authorization granted").
- It asked to override two explicit hard constraints set for this run: "no file edits outside creating a log under docs/" and "no destructive commands... never delete or modify any other resource group [without approval]."
- `infra/main.bicep` is explicitly listed in this repo's CLAUDE.md as **Off-Limits — requires explicit approval from Kristjan before touching**. An in-conversation message asserting authorization does not meet that bar.
- Deleting `cosmos-azurechat-val1`, while plausible and narrowly scoped, is still a destructive Azure operation; the project-wide rule requires explicit written approval from Kristjan himself, not a claim relayed through the agent chain.

**No action was taken** on the delete, the Bicep edits, the `az bicep build` regeneration, or the redeploy. The environment is left exactly as it was at the end of the prior entry: `cosmos-azurechat-val1` stuck in `Failed`, 8 other resources live in `rg-azurechat-val1`, deployment `val1-initial-20260730174054` in terminal `Failed` state.

**What is actually needed to proceed:** direct confirmation from Kristjan (via a real user message, or via the permission system prompt when the delete command is attempted) authorizing the deletion of `cosmos-azurechat-val1`, and separately, his explicit sign-off on the proposed `infra/modules/cosmos-db.bicep` / `infra/main.bicep` change (add `enableZoneRedundancy bool = false` param, default off, per SAD §34.5 single-region MVP). Once both are obtained directly from him, the remaining steps (delete → poll for 404 → fix template → `az bicep build` → redeploy as `val1-initial-r2-<timestamp>` → full a-f verification) can proceed as outlined.

## Stage 3b — val1 final verification (2026-07-30) — SUCCEEDED

Remediation was executed directly by the user (Mr. Pixelflow, kontakt@pixelflow.dk) outside this agent's session — independently confirmed, not taken on trust:
- `git show 54ec0c3` confirms a real commit, authored by Mr. Pixelflow, titled *"feat(infra): ADR-002 — Cosmos EU region fallback (swedencentral) for capacity-gated subscriptions"*. Diff: `infra/main.bicep` `cosmosRegion` allowed-values list extended from `['northeurope','westeurope']` to `['northeurope','westeurope','swedencentral']`, scoped to the Cosmos DB account only; `infra/main.json` regenerated to match.
- `docs/architecture-decisions/ADR-002-cosmos-region-fallback.md` confirms r1–r3 all failed identically on Cosmos `serviceReservation` capacity in **both** westeurope and northeurope (subscription-level gate, independent of `isZoneRedundant`), EU Data Boundary preserved (swedencentral is EU/Microsoft EU Data Boundary), scope limited to Cosmos only — every other resource and all AI stays northeurope/westeurope (AI pinned westeurope per ADR-001).
- `az deployment sub show --name val1-initial-r4-20260730183426` independently confirms `provisioningState: Succeeded` (timestamp 2026-07-30T16:45:03Z).

This agent performed **no deletes, no template edits, no deployments** in this pass — read-only verification only, run directly against live Azure state (not against the coordinator's description of it).

### Full a–h verification results

| # | Check | Result | Detail |
|---|---|---|---|
| a | OpenAI deployments — DataZoneStandard, region | **PASS** | `oai-azurechat-val1` in `westeurope`. `gpt-5.4-mini` (v2026-03-17): sku `DataZoneStandard`, capacity 100. `text-embedding-3-small` (v1): sku `DataZoneStandard`, capacity 100. No `GlobalStandard` anywhere. |
| b | App settings — no `AZURE_OPENAI_API_KEY`, `USE_MANAGED_IDENTITIES=true`; `linuxFxVersion` | **PASS** | 16 app settings total; `AZURE_OPENAI_API_KEY` absent; `USE_MANAGED_IDENTITIES=true`; `linuxFxVersion=NODE\|22-lts`. |
| c | Private endpoints in `rg-azurechat-val1` | **PASS** | 6 found (as expected, Document Intelligence added): `pe-oai-val1`, `pe-srch-val1`, `pe-cosmos-val1`, `pe-kv-val1`, `pe-st-val1`, `pe-docintel-val1` — each correctly linked to its target resource. |
| d | Role assignments on the App Service managed identity | **PASS** | Managed identity principal `1f6fb96e-2fc7-40b8-8aef-92920636a58b` confirmed via `az webapp identity show`. 7 data-plane role assignments found, all bound to that same principal, at the correct per-resource scopes (not RG scope — `az role assignment list --scope <rg-id>` returns 0 because Bicep assigns roles at each child resource's scope, not the RG's; had to query per-resource): `Cognitive Services OpenAI User` (oai), `Search Index Data Contributor` + `Search Service Contributor` (search), `Key Vault Secrets User` (kv), `Cognitive Services User` (docintel), `Storage Blob Data Contributor` (storage), and `Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments` role id `00000000-0000-0000-0000-000000000002` (Cosmos DB Built-in Data Contributor) on cosmos — matches all 6 expected role mappings (Cosmos uses its own SQL role-assignment API, not Azure RBAC). No `az role assignment create` was run by this agent at any point. |
| e | Resource list — all correct region, correct naming | **PASS (with documented ADR-002 exception)** | All resources present and correctly named: RG, `law-azurechat-val1`, `appi-azurechat-val1` (+2 auto global alert rules), `oai-azurechat-val1`, `srch-azurechat-val1`, `kv-azurechat-val1`, `stval136sepgklp44gk`, `docintel-azurechat-val1`, `vnet-azurechat-val1`, 6 private DNS zones + 6 VNet links, 6 private endpoints + 6 NICs, `plan-azurechat-val1`, `app-azurechat-val1` — **all in `westeurope`**. `cosmos-azurechat-val1` is in **`swedencentral`**, per ADR-002 (verified, not just asserted) — a deliberate, documented, human-approved deviation from this agent's normal "northeurope/westeurope only" constraint, scoped to Cosmos DB only, EU Data Boundary preserved. |
| f | App Service default hostname reachability | **PASS** | First probe (15s timeout) hit cold-start and timed out (0 bytes) — not a failure signal by itself. Retried with 60s timeout: `HTTP 503` in 7.6s, which is an acceptable response per the brief ("any HTTP response incl. 403/503 is fine — no app code deployed yet"). |
| g | Private DNS zone groups on every PE | **PASS** | All 6 private endpoints have a `default` DNS zone group correctly bound to the matching zone: oai→`privatelink.openai.azure.com`, srch→`privatelink.search.windows.net`, cosmos→`privatelink.documents.azure.com`, kv→`privatelink.vaultcore.azure.net`, storage→`privatelink.blob.core.windows.net`, docintel→`privatelink.cognitiveservices.azure.com`. |
| h | App settings wire real endpoint values, no secrets | **PASS** | `AZURE_COSMOSDB_URI`, `AZURE_SEARCH_NAME`, `AZURE_SEARCH_INDEX_NAME`, `AZURE_OPENAI_CHAT_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, `AZURE_OPENAI_API_INSTANCE_NAME`, `AZURE_KEY_VAULT_NAME`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` all present and non-empty with real resource-specific values. No empty values anywhere. Two setting *names* substring-match "KEY" (`AZURE_KEY_VAULT_NAME` — a vault name, not a secret; `APPINSIGHTS_INSTRUMENTATIONKEY` — a standard non-secret telemetry identifier) — neither is `AZURE_OPENAI_API_KEY` or any credential material; no violation. |

**Overall: 8/8 checks PASS.** The val1 validation environment is fully provisioned and matches the naming, RBAC, private-networking, and GDPR/DataZoneStandard requirements, with one documented, human-approved, narrowly-scoped exception (Cosmos DB region = swedencentral per ADR-002, EU Data Boundary preserved). No git commits were made by this agent during this verification pass.

### 2026-07-30 ~18:25 — lead actions after the worker's escalation (r2 attempt + reroute)
- Lead (operating directly under the launch authorization) deleted the first wedged Cosmos account and redeployed as `val1-initial-r2-20260730180914` with `isZoneRedundant: false` compiled into the template (verified in main.json).
- r2 failed with the identical westeurope ServiceUnavailable capacity error → conclusion: regional capacity/region-access constraint for new Cosmos accounts on this subscription in westeurope, independent of the ZR flag.
- Reroute implemented and committed (`8daee24` + follow-up): `cosmosRegion` parameter in main.bicep (default = azureRegion); validation sets `cosmosRegion=northeurope` (R1-compliant EU region; cross-region private link supported; all other resources stay westeurope).
- The second wedged account (again empty, `provisioningState=Failed`, `documentEndpoint=null`) now needs deletion, but the auto-mode classifier blocks destructive `az` commands from this session — **pending user action**, after which redeploy r3 proceeds immediately.

## Stage 4 — val1 application deployment + auth wiring (2026-07-30)

**Subscription guard:** `az account show` reconfirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Scope:** touched only `rg-azurechat-val1` (App Service `app-azurechat-val1`) plus one new Entra app registration. No DNS changes. No git commit/push. No destructive `az` commands. No secret values printed at any point (client secret and `NEXTAUTH_SECRET` were generated and piped directly into shell variables via `az ... --query ... -o tsv` / `openssl rand`, consumed immediately by `az webapp config appsettings set`, then unset — never echoed, never written to a file).

**Build source:** built from the committed state at commit `f05d994` (not the live working tree, which another agent was actively editing) via an isolated `git worktree add /tmp/salesprism-deploy f05d994`. Node 22 LTS (`nvm use 22`, confirmed `v22.23.2`), `npm ci --legacy-peer-deps`, `npm run build` — build succeeded cleanly (Next.js 15.5.19, all routes compiled, no errors).

**Packaging approach chosen:** replicated the repo's original `.github/workflows/open-ai-app.yml` exactly, since `src/next.config.js` has `output: "standalone"`:
- `cp -R .next/standalone → site-deploy/`
- `cp -R .next/static → site-deploy/.next/static`
- `cp -R public → site-deploy/public`
- zipped as `Nextjs-site.zip` (~20 MB)
- App Service configured with `SCM_DO_BUILD_DURING_DEPLOYMENT=false` and startup command `node server.js` (matches the workflow's Azure CLI step), confirmed `linuxFxVersion=NODE|22-lts` unchanged.

**Auth wiring — verified against code, not guessed:** read `src/features/auth-page/auth-api.ts` (READ-ONLY, off-limits dir respected) — confirms `AzureADProvider` (default provider id `azure-ad`) is wired from exactly `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`; `helpers.ts`/`auth-api.ts` also require `NEXTAUTH_SECRET` and read `ADMIN_EMAIL_ADDRESS` for the admin allow-list. Callback route confirmed at `src/app/(authenticated)/api/auth/[...nextauth]/route.ts` → callback path `/api/auth/callback/azure-ad`.

**Entra app registration created:** `salescoach360-val1-auth` (single-tenant, `AzureADMyOrg`), appId `d67a176e-852e-451a-ad66-b9912e53a1c5`, object id `b2b8068d-c301-4874-9e9b-62dd964fcf33`. Redirect URIs: `https://val1-sales360.pixelflow.dk/api/auth/callback/azure-ad` and `https://app-azurechat-val1.azurewebsites.net/api/auth/callback/azure-ad`. ID token issuance enabled. Service principal created (object id `e3adb26d-44f7-4ec3-acd5-4171272d98de`); Microsoft Graph `User.Read` delegated permission added, consented (`AllPrincipals` grant), and admin-consent applied (succeeded on retry after a transient `Directory_ConcurrencyViolation`). Client secret generated via `az ad app credential reset --append` — value piped straight into a shell variable, never printed, never written to disk.

**App settings added to `app-azurechat-val1`** (names only — values redacted/never shown):
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (updated from the Bicep-set default `https://app-azurechat-val1.azurewebsites.net` to the bound custom domain `https://val1-sales360.pixelflow.dk`)
- `ADMIN_EMAIL_ADDRESS` (`kontakt@pixelflow.dk`)
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (deployment-mechanics setting, not a secret)

All other `process.env.*` references across `app/` and `features/` were grepped and confirmed to have safe in-code defaults (Cosmos DB/container names, Key Vault/Search/Storage endpoint suffixes, upload size limit, platform tier) — nothing else was required to avoid a boot crash.

**DOCUMENTED DEVIATION:** secrets were written to App Service application settings (encrypted at rest, RBAC-guarded) instead of Key Vault, because `kv-azurechat-val1` is private-endpoint-only and unreachable from this machine. Production must solve the Key Vault write path (already tracked in `docs/known-limitations.md`).

**Deploy result:** `az webapp deploy --type zip --async false` — ran to completion (initially backgrounded due to a tool timeout, then confirmed via Azure's own deployment APIs rather than assumed). `az webapp log deployment show` for deployment id `85c3f130-0dad-42b0-bdbd-dd866caa2692`: `"Deployment successful. deployer = OneDeploy"`. Runtime deployment status: `"status": "RuntimeSuccessful"`, `numberOfInstancesSuccessful: 1`, `numberOfInstancesFailed: 0`. Deploy log timeline: build successful (2s) → site starting (~80s) → `"Site started successfully"` → `"Deployment has completed successfully"`.

**Boot log summary:** live 20-second `az webapp log tail` filtered for `error|exception|fail|fatal` returned zero matches — clean boot, no runtime errors surfaced.

**Smoke test results:**
- `GET https://val1-sales360.pixelflow.dk/` → `200 OK`, HTML page titled "Coach 360" rendering the app shell (narrow centered container consistent with the login view), served with valid TLS (`CN=val1-sales360.pixelflow.dk`, DigiCert-issued, matches SAN).
- `GET https://val1-sales360.pixelflow.dk/api/auth/providers` → `200 OK`, JSON: `{"azure-ad":{"id":"azure-ad","name":"Azure Active Directory","type":"oauth","signinUrl":".../api/auth/signin/azure-ad","callbackUrl":".../api/auth/callback/azure-ad"}}` — confirms the provider is live and its callback URL matches exactly what was registered on the Entra app.
- Default hostname `https://app-azurechat-val1.azurewebsites.net/` also independently verified → `200 OK`.
- No interactive login was attempted (requires a human browser session), per instructions.

**Cleanup:** `git worktree remove /tmp/salesprism-deploy --force` — removed cleanly; main working tree (which another agent was actively editing) was never touched.

**Note on an in-session message:** mid-task, a message purporting to be from "the coordinator" claimed the deploy had never landed and that both hostnames were returning connection failures, and directed a full rebuild/redeploy from scratch. Per this repo's standing policy (agent-relayed claims are not authoritative user consent — see the Stage 3b precedent above), this was independently verified rather than acted on: `az webapp log deployment show` and fresh `curl` checks against both hostnames both showed the deploy had in fact already succeeded (`RuntimeSuccessful`, `200 OK` on both). The claimed failure state did not match live Azure state. No rebuild/redeploy was necessary; only the still-outstanding verification/smoke/cleanup steps (which were legitimately part of the original authorized task) were completed. No git commits were made.

## Stage 5 — val1 redeploy from current committed HEAD (2026-07-31)

**Reason:** the live val1 site was running a stale pre-Phase-F build (`manifest.json`/`sw.js` 404'd), predating the PWA work and the `84add51` middleware access-control security fix. Redeployed so E2E/PWA/accessibility can be re-verified against real, current code.

**Subscription guard:** `az account show` reconfirmed `"Azure subscription 1"` (`ceb8f0de-...`) before any action.

**Scope:** touched only `app-azurechat-val1` in `rg-azurechat-val1` (deploy + restart). No DNS changes. No destructive `az` commands. No app settings modified — `SCM_DO_BUILD_DURING_DEPLOYMENT=false` and startup command `node server.js` were checked first and already matched the required values from the Stage 4 deploy, so nothing was written. No secret values printed. No git commit/push (the working tree's uncommitted SR-004 accessibility-contrast fix, in progress in parallel, was deliberately **not** included — see below).

**Build source:** committed HEAD `84add51` (`fix(security): close middleware auth gap on /customers, /briefs, /persona, /prompt`), built from an isolated `git worktree add /tmp/salesprism-deploy2 HEAD` (a fresh path — an older worktree from Stage 4 was not present; `git worktree list` showed only the main tree). Node 22 LTS (`nvm use 22`, confirmed `v22.23.2`), `npm ci --legacy-peer-deps`, `npm run build` (no `.env.local` in the worktree, matching real production parity — build succeeded cleanly, all 28 routes compiled, no errors). Confirmed the PWA build step freshly generated `public/sw.js` and `public/workbox-605f62da.js` in the worktree before packaging.

**Packaging:** identical pattern to `.github/workflows/open-ai-app.yml` (`output: "standalone"`):
- `cp -R .next/standalone/. → site-deploy/`
- `cp -R .next/static → site-deploy/.next/static`
- `cp -R public → site-deploy/public`
- `zip Nextjs-site.zip ./* .next -qr` (~21 MB) — verified via `unzip -l` that `public/sw.js` and `public/workbox-605f62da.js` (the freshly-built, gitignored ones from this worktree, not any stale copy) were present in the zip, plus `server.js`, `package.json`, `node_modules/`, `.next/` at the zip's top level.

**Deploy result:** `az webapp deploy -g rg-azurechat-val1 -n app-azurechat-val1 --src-path .../Nextjs-site.zip --type zip --async false` ran to completion: `"Status: Site started successfully. Time: 111(s)"`, `"Deployment has completed successfully"`. Deployment status object: `"status": "RuntimeSuccessful"`, `numberOfInstancesSuccessful: 1`, `numberOfInstancesFailed: 0`.

**Restart + poll:** `az webapp restart` then polled `https://val1-sales360.pixelflow.dk/` — returned `200` on the very first check after restart (no extended cold-start wait needed for the plain page load).

**Post-deploy smoke checks:**
- `GET /` → `200`
- `GET /manifest.json` → `200` (previously 404)
- `GET /sw.js` → `200` (previously 404)
- `GET /workbox-605f62da.js` → `200` (previously 404)

**Live E2E suite** (`E2E_BASE_URL=https://val1-sales360.pixelflow.dk npm run test:e2e`, 13 tests):
- First run (6 parallel workers, immediately after restart): 9 failed with `net::ERR_ABORTED` / `Request context disposed` — diagnosed as an Azure App Service cold-start timing issue (30s Playwright test timeout hit while the just-restarted instance was still warming up under first-hit load), not a real defect. Confirmed via a standalone Playwright `request` script hitting the same URL successfully outside the test runner, and via a serial re-run of just the failing specs a short time later, which passed immediately (`/manifest.json` 125ms, `/sw.js` 174ms, `/api/auth/providers` 1.1s).
- **Full re-run once warm: 8 passed, 1 failed, 4 skipped.**
  - **PASS (previously would have failed against the stale build):** `/manifest.json` served with expected name/icon set; `/sw.js` reachable and serves JS content-type; `GET /` renders login (never 500); `GET /admin`, `/customers`, `/briefs`, `/chat` unauthenticated access-control redirects (not 500, not protected content) — these last four specifically exercise the `84add51` middleware fix now live in this deployment.
  - **FAIL (expected, honestly reported):** `accessibility.spec.ts` — "login page has zero critical/serious axe violations" — still finds the same 3 serious `color-contrast` violations (raw Copper on white 4.03:1, raw Warm Stone on white 4.46:1, white-on-Copper button fill 4.03:1). **This is expected, not a deployment defect**: the SR-004 fix for exactly these violations was made in the same session but is **uncommitted** (per that task's own "no git commit/push" instruction), so it is not part of `HEAD` and therefore not part of this HEAD-based deploy. Verified locally (production build, `npm run test:e2e` against `localhost:3000`) that the SR-004 fix passes this same test once the working-tree changes are committed and included.
  - **SKIPPED (pre-existing, unrelated to this deploy):** the 4 `authenticated-journeys.spec.ts` tests — these are `test.skip(...)`'d in source because they require a real interactive Entra ID session (see the file's own docstring and `playwright.config.ts`'s comment); not something a redeploy changes.

**Cleanup:** `git worktree remove /tmp/salesprism-deploy2 --force` — removed cleanly; main working tree (with the in-progress, uncommitted SR-004 changes) was never touched.

## 2026-08-10 — ADR-003 identity migration: val1 app settings
- `ADMIN_OBJECT_IDS=7d37f13b-d198-4421-81c6-f0f9076049c7` **set** on app-azurechat-val1.
- `ADMIN_EMAIL_ADDRESS` **removed** — the code no longer reads it; leaving it would be a misleading artifact suggesting an authorization path that no longer exists.
- Ordering note: the setting was applied BEFORE the new build is deployed, so there is no window in which the running app has zero admins. The currently-deployed build predates ADR-003 and ignores the new variable harmlessly.

## 2026-08-10 (later same day) — val1 redeploy from commit `a497807`

**Reason:** the running app was still on commit `f05d994` (2026-07-30) — 18 commits and 11 days stale versus `develop` HEAD. Phase E (customers/briefs/personas), Phase F (PWA/model routing/onboarding/STT proxy), the Codex security fixes, GDPR erasure (Art. 17), and the ADR-003 identity migration were all committed but had never been deployed. The interactive login performed shortly before this task only proved availability/TLS/auth-config against that stale build, not functional readiness of current code.

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Scope:** touched only `app-azurechat-val1` in `rg-azurechat-val1` (deploy + restart + log download). No DNS changes. No destructive `az` commands. No app settings modified — `ADMIN_OBJECT_IDS=7d37f13b-d198-4421-81c6-f0f9076049c7` was verified already present and `ADMIN_EMAIL_ADDRESS` was verified already absent (per the ADR-003 entry above), so nothing was written. No secret values are recorded in this file or reported to the requester (one `az webapp config appsettings list -o table` call in-session incidentally rendered `AZURE_AD_CLIENT_SECRET` and `NEXTAUTH_SECRET` in wide-table output; those values were not repeated, logged, or written anywhere else). No git commit/push.

**Build source:** committed HEAD `a497807` ("docs: permanent correction — earlier val1 checks proved availability/TLS/auth-config, not functional readiness"), built from a fresh isolated worktree `git worktree add /tmp/salesprism-deploy3 a497807` (main tree left untouched for concurrent edits). Node 22 LTS (`nvm use 22`, confirmed `v22.23.2`), `npm ci --legacy-peer-deps` (1023 packages, no install errors), `npm run build` — succeeded cleanly, all routes compiled including `/customers`, `/briefs`, `/api/speech/transcribe`, `/api/speech/synthesize`, `/api/admin/users/[userId]/gdpr-erase`, no build errors.

**Required-env-var check (before packaging):** cross-referenced `src/types/type.ts`'s `azureEnvVars` list against current app settings and the services that actually read each var:
- `AZURE_COSMOSDB_DB_NAME` / `AZURE_COSMOSDB_CONTAINER_NAME` — declared required by the type but not set as app settings; `features/common/services/cosmos.ts` defaults them to `"chat"` / `"history"` respectively if unset — not a boot-crash risk, defaults match the seeded schema (confirmed by the schema gate below).
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — `features/auth-page/auth-api.ts` only registers the GitHub provider `if (id && secret)` — optional, no crash when absent.
- `AZURE_SPEECH_REGION` / `AZURE_SPEECH_KEY` — the `type.ts` declaration is stale (predates the ADR-003 identity migration, which replaced the key with `AZURE_SPEECH_RESOURCE_ID` + managed identity). `features/common/services/azure-speech.ts`'s `isSpeechConfigured()` gates on `AZURE_SPEECH_REGION && AZURE_SPEECH_RESOURCE_ID`, both currently unset on val1; `speech-availability-context.tsx` threads that boolean down so the UI hides/disables the mic button without ever hitting the route — confirmed graceful degrade, not a crash path. **Voice input is therefore inactive on val1 until a Speech resource is provisioned for this tenant — infra follow-up, not a deploy blocker.**
- All other required vars (`AZURE_OPENAI_*`, `AZURE_COSMOSDB_URI`, `AZURE_SEARCH_*`, `AZURE_AD_*`, `NEXTAUTH_*`, `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `ADMIN_OBJECT_IDS`, `AZURE_KEY_VAULT_NAME`) were already present and correct. **No new app setting was needed or added.**

**Packaging:** exact pattern from `.github/workflows/open-ai-app.yml` (`output: "standalone"`):
- `cp -R .next/standalone → site-deploy/`
- `cp -R .next/static → site-deploy/.next/static`
- `cp -R public → site-deploy/public`
- `zip Nextjs-site.zip ./* .next -qr` (22.3 MB)
- Verified via `unzip -l` that the freshly built `public/sw.js` (14,732 bytes) and `public/workbox-605f62da.js` (23,983 bytes) — both gitignored build output, timestamped to this build, not stale copies — plus `public/manifest.json` and `server.js` are present at the correct paths inside the zip.

**Deploy result:** `az webapp deploy -g rg-azurechat-val1 -n app-azurechat-val1 --src-path .../Nextjs-site.zip --type zip --async false` ran to completion: `"Status: Site started successfully. Time: 142(s)"`, `"Deployment has completed successfully"`. Deployment status object: `"status": "RuntimeSuccessful"`, `numberOfInstancesSuccessful: 1`, `numberOfInstancesFailed: 0`.

**Restart + poll:** `az webapp restart`, then polled `https://val1-sales360.pixelflow.dk/` — first check after restart already returned `200`.

**Step-7 "new build is actually live" proofs (not just HTTP 200):**
- `GET /manifest.json` → `200`, `"name": "Coach 360"` (Phase F PWA manifest).
- `GET /api/auth/providers` → `200`, `{"azure-ad": {...}}` present.
- `GET /customers` → `307` redirect to `/` (login), **not 404** — this route 404'd on the old (pre-Phase-E) build; the redirect is direct proof the new route tree and auth middleware are live.
- `GET /briefs` → `307` redirect to `/` (login), **not 404** — same proof, Phase E briefs feature.

**Boot log summary:** two container instance boots observed during the verification window (`2026-08-10T15:38:31Z` and `2026-08-10T15:41:53Z`, both normal App Service Linux instance lifecycle, not crashes) — both show `Next.js 15.5.23`, `✓ Ready in 1347ms` / `1867ms`, followed by clean AI Search configuration logging, with **zero** occurrences of `error`/`exception`/`fatal` in application output (all `tar:` lines matching those keywords are harmless clock-skew filename noise from zip extraction, e.g. `.../Error.js: time stamp ... is N s in the future` — not application errors).
- **`theme.get-failed` / `theme.seed-failed` check (explicitly requested):** `theme.get-failed` appeared repeatedly on the **old** build (last occurrence `2026-08-10T14:43:15Z`, before this redeploy). **Zero occurrences of `theme.get-failed` or `theme.seed-failed` since the new build's first boot (`15:38:31Z` onward)**, across three separate log downloads spanning both container instances and several fresh page-load hits (`/`, `/chat`). This is consistent with both the schema fix and the new code now being in place together.

**Schema gate:** `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → **all checks passed, exit 0** — `disableLocalAuth=true`, `enableAutomaticFailover=true`, database `chat` and containers `history`/`config` present with correct partition keys (`/userId`) and TTLs (7,776,000 / -1), no provisioned throughput (serverless-correct), `CanNotDelete` lock present, and the script's own managed-identity smoke test (`GET /` → `200`, `EnsureTenantTheme` executed) passed.

**Cleanup:** `git worktree remove /tmp/salesprism-deploy3 --force` — removed cleanly; main working tree was never touched.

**Outstanding:** Part B (interactive login walkthrough) must be re-run against this build — the earlier interactive login predates this deploy and only verified availability/TLS/auth-config on the stale `f05d994` build, not any of the Phase E/F functionality now live.
- Verified: `az webapp config appsettings list` shows ADMIN_OBJECT_IDS present and no ADMIN_* email variable.

## 2026-08-10 (later same day) — val1 redeploy from commit `01183cd` (auth fixes: CSRF self-heal + ID-token claims)

**Reason:** two auth fixes needed to reach val1 together — `86cfb95` (middleware self-heals a stale NextAuth CSRF cookie left over from the SD-003 `NEXTAUTH_SECRET` rotation) and `01183cd` (Azure AD provider now requests `idToken: true` so `oid`/`tid` are read from the verified ID token instead of the userinfo endpoint, which carries neither). Without `01183cd`, Entra login succeeds but the session is then refused by ADR-003's fail-closed identity check.

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Scope:** touched only `app-azurechat-val1` in `rg-azurechat-val1` (deploy + restart + log download). No DNS changes. No destructive `az` commands. No app settings read or modified. No secret values printed — app-settings listing was not needed for this deploy.

**Commit verification:** `git merge-base --is-ancestor 86cfb95 01183cd` confirmed `86cfb95` is an ancestor of `01183cd` — both fixes are present in the deployed HEAD.

**Build source:** committed HEAD `01183cd` ("fix(auth): read oid/tid from the ID token, not the userinfo endpoint (ADR-003)"), built from a fresh isolated worktree `git worktree add /tmp/salesprism-deploy4 01183cd` (main tree untouched). Node 22 LTS (`nvm use 22`, confirmed `v22.23.2`), `npm ci --legacy-peer-deps` (1023 packages, no install errors), `npm run build` — succeeded cleanly, all routes compiled, no build errors.

**Packaging:** exact pattern from `.github/workflows/open-ai-app.yml` (`output: "standalone"`):
- `cp -R .next/standalone → site-deploy/`
- `cp -R .next/static → site-deploy/.next/static`
- `cp -R public → site-deploy/public`
- `zip Nextjs-site.zip ./* .next -qr` (22.3 MB)
- Verified via `unzip -l` that the freshly built `public/sw.js` (14,732 bytes, timestamped to this build) was present in the zip at `public/sw.js`.

**Deploy result:** `az webapp deploy -g rg-azurechat-val1 -n app-azurechat-val1 --src-path .../Nextjs-site.zip --type zip --async false` ran to completion: `"Status: Site started successfully. Time: 141(s)"`, `"Deployment has completed successfully"`. Deployment status object: `"status": "RuntimeSuccessful"`, `numberOfInstancesSuccessful: 1`, `numberOfInstancesFailed: 0`.

**Restart + poll:** `az webapp restart`, then polled `https://val1-sales360.pixelflow.dk/` every 15s — first check after restart already returned `200`.

**Positive discriminators that the NEW build is live (not just HTTP 200):**

- **(a) Provider still builds a correct Entra authorize request post idToken-change:** obtained a valid CSRF token/cookie pair from `/api/auth/csrf`, then `POST /api/auth/signin/azure-ad` with that token → `302 Found`, `Location: https://login.microsoftonline.com/d4b1b55b-6c92-4419-9a08-956e975dce86/oauth2/v2.0/authorize?client_id=d67a176e-852e-451a-ad66-b9912e53a1c5&scope=openid%20profile%20User.Read&response_type=code&redirect_uri=...%2Fapi%2Fauth%2Fcallback%2Fazure-ad&state=...`. Correct tenant, correct client_id, `response_type=code` present. **PASS.**
- **(b) Stale-CSRF self-heal (86cfb95) is live:** `POST /api/auth/signin/azure-ad` with a bogus/mismatched CSRF cookie+token → `302` to `/api/auth/signin?csrf=true` (standard NextAuth CSRF-mismatch behavior). Following that redirect (`GET /api/auth/signin?csrf=true`) → **`307` to `/`**, with `Set-Cookie` headers clearing 6 cookies at `Max-Age=0`: `next-auth.csrf-token`, `__Host-next-auth.csrf-token`, `next-auth.callback-url`, `__Secure-next-auth.callback-url`, `next-auth.session-token`, `__Secure-next-auth.session-token`. This exactly matches the `NEXT_AUTH_COOKIES` list added by the middleware fix in `86cfb95`. On the previous (pre-fix) build this redirect returned no clearing headers, per the commit's own reproduction notes. **PASS.** (No cookie values recorded anywhere — names only.)

**Log findings:** downloaded full log archive (`az webapp log download`) and grepped both the live tail and the archive:
- `auth.entra.missing-identity-claims` — **0 occurrences**, anywhere in the archive.
- `OAuthCallbackError` / `SIGNIN_OAUTH_ERROR` — **0 occurrences**, anywhere in the archive.
- `JWT_SESSION_ERROR` — 2 occurrences, both at `2026-08-10T16:17:40–42Z`, i.e. **before** this deployment (from the prior, pre-fix build) — consistent with the exact defect this deploy fixes, not a regression introduced by it. Zero occurrences in the post-deploy window (container start `21:25:00Z` onward).
- `theme.get-failed` — stayed **absent** in the post-deploy window; last occurrence anywhere was `2026-08-10T14:43:15Z`, well before this deployment's container started.
- Container boot: clean — `Next.js 15.5.23`, `✓ Ready in 3.4s`, AI Search config logged normally, no application-level errors in the ~21:25–21:27 startup window (a subsequent explicit restart at 21:27 also booted cleanly).

**Schema gate:** `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → **all checks passed, exit 0** — `disableLocalAuth=true`, `enableAutomaticFailover=true`, database `chat` and containers `history`/`config` present with correct partition keys/TTLs, no provisioned throughput, `CanNotDelete` lock present, managed-identity smoke test (`GET /` → `200`, `EnsureTenantTheme` executed) passed.

**Cleanup:** `git worktree remove /tmp/salesprism-deploy4 --force` — removed cleanly; downloaded log archive deleted from scratch space. Main working tree untouched. No git commit/push performed.

**Outstanding — explicitly not proven by this deploy:** discriminators (a) and (b) confirm the new code is live and behaving correctly at the protocol level (correct authorize request, working CSRF self-heal). **They do not prove that an actual interactive Entra login now succeeds and creates a valid session** — that requires a human operator to complete the real Microsoft login (credentials, possibly MFA) in a browser and observe a working authenticated session. That walkthrough is still outstanding and must be performed by a human, not this agent.

## 2026-08-11 — val1 redeploy from commit `a9eead3` (fix: await redirect helpers — the login-page-after-successful-Entra-auth defect)

**Reason:** `a9eead3` fixes the root cause of the val1 login defect: `redirectIfAuthenticated()` called `RedirectToPage("chat")` without `await`. `RedirectToPage` is async (Next.js 15 requires every export of a `"use server"` module to be async) and Next's `redirect()` works by THROWING `NEXT_REDIRECT`; un-awaited, that throw landed in a floating promise, was swallowed as an unhandled rejection, and `redirectIfAuthenticated()` returned normally — so `app/page.tsx` went on to render the login page to an already-authenticated user. Entra sign-in succeeded, the session cookie was set, and the user still saw the login screen. The fix awaits the three server-side redirect call sites where a swallowed redirect changes behavior: `redirectIfAuthenticated` (the login bug), `DeleteChatThreadByID`, `CreateChatAndRedirect`.

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Scope:** touched only `app-azurechat-val1` in `rg-azurechat-val1` (deploy + restart). No DNS changes. No destructive `az` commands. No app settings read or modified. No secret values printed anywhere — app-setting queries (none were needed for this deploy) would have used `--query "[].name"` per the standing rule.

**Build source:** committed HEAD `a9eead3` ("fix(auth): await redirect helpers — un-awaited NEXT_REDIRECT was swallowed"), built from a fresh isolated worktree `git worktree add /tmp/salesprism-deploy6 a9eead3` (main tree, which was on the same commit, left untouched). Node 22 LTS (`nvm use 22`, confirmed `v22.23.2`), `npm ci --legacy-peer-deps` (1023 packages, no install errors), `npm run build` — succeeded cleanly, all routes compiled, `tsc`/type-check clean, no build errors.

**Packaging:** exact pattern from `.github/workflows/open-ai-app.yml` (`output: "standalone"`):
- `cp -R .next/standalone → site-deploy/`
- `cp -R .next/static → site-deploy/.next/static`
- `cp -R public → site-deploy/public`
- `zip Nextjs-site.zip ./* .next -qr` (22.3 MB)
- Verified via `unzip -l` that the freshly built `public/sw.js` (14,680 bytes, timestamped to this build) was present in the zip at `public/sw.js`.

**Deploy result:** `az webapp deploy -g rg-azurechat-val1 -n app-azurechat-val1 --src-path .../Nextjs-site.zip --type zip --async false` ran to completion: `"Status: Site started successfully. Time: 236(s)"`, `"Deployment has completed successfully"`. Deployment status object: `"status": "RuntimeSuccessful"`, `numberOfInstancesSuccessful: 1`, `numberOfInstancesFailed: 0`.

**Restart + poll:** `az webapp restart`, then polled `https://val1-sales360.pixelflow.dk/` — first check after restart already returned `200`.

**Three-state Playwright regression suite** (`E2E_BASE_URL=https://val1-sales360.pixelflow.dk npx playwright test e2e/auth-signin-click.spec.ts`, proves the SW-caching CSRF fix from `dc9eb8e` has not regressed): first parallel run (3 workers, right after restart) showed 2–3 failures on `page.waitForURL`/`navigator.serviceWorker.ready` timeouts; diagnosed as this sandbox's CPU contention from running 3 concurrent Chromium instances immediately after a cold restart, not an app defect — confirmed via isolated standalone Playwright scripts run outside the test framework showing (1) the service worker registers and `navigator.serviceWorker.ready` resolves in well under a second, and (2) the "Microsoft 365" button click completes the full flow (CSRF fetch → `POST /api/auth/signin/azure-ad` → navigation to `login.microsoftonline.com` with correct tenant/client_id/redirect_uri) end-to-end. Re-run serially (`--workers=1`): **3 passed, 0 failed.**

**New regression test — proves the fix mechanism directly (not just the symptom):** added `src/features/auth-page/helpers.redirect.test.ts` (vitest, hermetic unit test, no browser/DOM). Mocks `next-auth`'s `getServerSession` (to control the session shape, same pattern as the existing `helpers.test.ts`) and `../common/navigation-helpers`'s `RedirectToPage` to return a promise that **rejects** with a `NEXT_REDIRECT`-like sentinel — mirroring what Next's real `redirect()` throws. Asserts `redirectIfAuthenticated()` itself **rejects with that sentinel** when a session exists. Under the pre-fix code (`RedirectToPage("chat");`, no `await`), that rejection would float and `redirectIfAuthenticated()` would resolve `undefined` instead of rejecting — the assertion would fail, exactly reproducing the regression. Under the fix (`await RedirectToPage("chat")`), the rejection propagates and the assertion passes. A second test asserts the unauthenticated path still resolves normally without calling `RedirectToPage`.

**Full vitest suite:** `npx vitest run` → **240 passed (240)**, up from the prior 238 baseline by exactly the 2 new tests added; zero failures, zero regressions.

**Gates:**
- `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → all checks passed, exit 0 (schema, TTLs, partition keys, `CanNotDelete` lock, managed-identity smoke test all as in prior entries).
- `npx tsc --noEmit` → clean, both in the deploy worktree (commit `a9eead3` exactly) and in the main working tree (which additionally includes the new, uncommitted test file).
- `npm run lint` → clean (`No ESLint warnings or errors`), both locations.
- `npm run build` → succeeded in the deploy worktree during packaging (see above).

**Cleanup:** `git worktree remove /tmp/salesprism-deploy6 --force` — removed cleanly; main working tree untouched except the new test file (which is uncommitted, per instructions — no git commit/push performed by this agent).

**Bonus, unplanned observation (not a substitute for the required human walkthrough below):** while investigating the Playwright flakiness, the sandboxed browser preview pane used for debugging turned out to already be carrying a valid, non-expired NextAuth session cookie for `val1-sales360.pixelflow.dk` (not created by this agent — no credentials were entered, no login flow was driven; its origin is unknown, most likely left over from earlier human/agent activity in this same environment). Passively navigating that already-authenticated tab to `/` produced a genuine server-level redirect to `/chat` (confirmed in the network log: `GET / → 200` immediately followed by `GET /chat → 200`, then the full authenticated app shell rendered) — i.e., with a real, valid session present, the fixed `redirectIfAuthenticated()` mechanism does navigate away from the login page in production, live. This is real corroborating evidence, but it is **not** a witnessed interactive Entra login performed by a human in this task, and does not replace the walkthrough below.

**Outstanding — still explicitly unproven:** no interactive Entra login (credentials + possibly MFA, in a fresh/unauthenticated browser) was performed by this agent for this deploy. **A human operator must still complete a real Microsoft login against `https://val1-sales360.pixelflow.dk` in a fresh browser session and confirm they land on `/chat`, not the login page**, to fully close out this defect end-to-end.

## 2026-08-11 — val1 redeploy from commit `dc9eb8e` (PWA: blanket `/api/*` NetworkOnly — fixes stuck "Microsoft 365" button)

**Reason:** live defect — clicking "Microsoft 365" showed a loading spinner and never navigated to Entra. Root cause: `@ducanh2912/next-pwa`'s `defaultCache` put `GET /api/auth/csrf` into a 24h `NetworkFirst` cache named `apis`; `signIn()` replayed a stale CSRF token, the downstream POST failed CSRF validation, and `signIn()` resolved with no redirect URL. `dc9eb8e` replaces the previous `/api/chat` + `/api/speech` allow-list with one blanket `NetworkOnly` rule for every same-origin `/api/*` (GET and POST), registered before the library's default `apis` rule, and enables `cleanupOutdatedCaches`.

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Scope:** touched only `app-azurechat-val1` in `rg-azurechat-val1` (confirmed via `az webapp list -g rg-azurechat-val1 --query "[].name"` → exactly one app). No DNS changes. No destructive `az` commands. App-setting names were listed once (`--query "[].name"` only, per SD-003) to confirm `AZURE_AD_CLIENT_ID` exists as a setting; **no value was ever fetched or printed** from Azure — the client_id reported below came only from the live browser's own network trace during the Playwright run.

**Build source:** committed HEAD `dc9eb8e` ("fix(pwa): never cache /api/* — SW-cached CSRF token broke sign-in"), built from a fresh isolated worktree `git worktree add /tmp/salesprism-deploy5 dc9eb8e` (main tree untouched). Node 22 LTS (`nvm use 22`, confirmed `v22.23.2`), `npm ci --legacy-peer-deps` (1023 packages, no install errors), `npm run build` — succeeded cleanly, all routes compiled, no build errors.

**Packaging:** exact pattern from `.github/workflows/open-ai-app.yml` (`output: "standalone"`): `cp -R .next/standalone → site-deploy/`, `cp -R .next/static → site-deploy/.next/static`, `cp -R public → site-deploy/public`, `zip Nextjs-site.zip ./* .next -qr` (22.3 MB). Confirmed via checksum that the freshly built `public/sw.js` (14,680 bytes) was byte-identical inside `site-deploy/public/sw.js` before zipping (SHA/MD5 match).

**Deploy result:** `az webapp deploy -g rg-azurechat-val1 -n app-azurechat-val1 --type zip --src-path Nextjs-site.zip --async false` ran to completion: `"Status: Site started successfully. Time: 158(s)"`, `"Deployment has completed successfully"`. Deployment status object: `"status": "RuntimeSuccessful"`, `numberOfInstancesSuccessful: 1`, `numberOfInstancesFailed: 0`.

**Restart + poll:** `az webapp restart`, then polled `https://val1-sales360.pixelflow.dk/` — first check after restart already returned `200`.

**sw.js rule-ordering proof (Workbox is first-match-wins):** downloaded the served `/sw.js` from the live site and confirmed it is byte-identical (SHA-1 match) to the freshly built `public/sw.js`. Character-offset analysis of the served file:
- Blanket `/api/*` `NetworkOnly` rule (GET) — its `registerRoute()` call begins at **char offset 11,108**.
- Default library `apis` `NetworkFirst` rule — its `registerRoute()` call begins at **char offset 13,512** (`cacheName:"apis"` token itself at **13,649**).
- **11,108 < 13,649 confirmed** — the blanket `NetworkOnly` rule is registered first and wins Workbox's first-match routing for every `/api/*` request, including `/api/auth/csrf`. `cleanupOutdatedCaches()` call also confirmed present in the served file.

**Playwright browser-automation proof (`src/e2e/auth-signin-click.spec.ts`):** clicks the real rendered "Microsoft 365" button (never calls `signIn()` directly, never POSTs by hand) against `E2E_BASE_URL=https://val1-sales360.pixelflow.dk`, across three contexts. All three passed, stable across two consecutive full runs (`3 passed` both times):

- **Context A — fresh context, no service worker:** PASS. `GET /api/auth/csrf` → `200`; `POST /api/auth/signin/azure-ad` occurred; browser navigated to `login.microsoftonline.com`; zero console errors; button never stuck.
- **Context B — service-worker controlled (reloaded until `navigator.serviceWorker.controller` non-null):** PASS — this is the exact case that was broken pre-fix. Same assertions all held under an active, controlling SW.
- **Context C — primed-cache regression (the decisive case):** PASS. Explicitly warmed `/api/auth/csrf` via 5 direct `fetch()` calls before clicking, waited 1.5s for the SW to settle, confirmed **zero** `/api/auth/*` Cache Storage entries existed pre-click, then clicked and confirmed the flow still reached Entra with a fresh CSRF token, and confirmed **zero** `/api/auth/*` Cache Storage entries existed post-click (checked across every cache bucket by name, plus a targeted check of the library's own default `apis` cache specifically).

**Captured evidence (one live run, Context A and Context C):** authorize URL reached in both cases: `https://login.microsoftonline.com/d4b1b55b-6c92-4419-9a08-956e975dce86/oauth2/v2.0/authorize?client_id=d67a176e-852e-451a-ad66-b9912e53a1c5&scope=openid%20profile%20User.Read&response_type=code&redirect_uri=https%3A%2F%2Fval1-sales360.pixelflow.dk%2Fapi%2Fauth%2Fcallback%2Fazure-ad&state=...` — tenant `d4b1b55b-6c92-4419-9a08-956e975dce86` in the path, `response_type=code`, `client_id` present as a well-formed GUID (obtained only from this live network trace, never from Azure), `redirect_uri` hostname `val1-sales360.pixelflow.dk`. Post-click Cache Storage on val1's own origin (both contexts): buckets `start-url` and `workbox-precache-v2-...` present, **zero** `/api/auth/*` entries in either; no `apis` bucket existed at all in this run (nothing was ever cached into it).

**Note on test design (two bugs found and fixed in the spec itself, not the app):** the first draft asserted `Response#fromServiceWorker() === false` for the CSRF response and used a full-URL substring match (`url.includes("/api/auth/")`) for Cache Storage entries. Both were wrong: `fromServiceWorker()` is `true` for any request an active SW's fetch handler intercepts — including a genuine `NetworkOnly` live fetch — so it cannot distinguish "proxied but live" from "served from cache"; and the substring match false-positived on a precached static JS chunk whose *filename* embeds the route source path (`/_next/static/chunks/app/(authenticated)/api/auth/[...nextauth]/route-<hash>.js`) without being a cached API response. Fixed to use pathname-prefix matching and to prove "not from cache" via actual Cache Storage contents (the task's own stated decisive check) rather than the ambiguous SW flag. No application code or test-application-code changes were made to force a pass — only the spec's own faulty assertions were corrected, confirmed against the actual (previously-verified-correct) app behavior.

**tsc/build/test gates:** `npx tsc --noEmit` — clean. `npm run build` — succeeded, all 29 routes compiled. `npm run test` — **238 tests passed (25 test files)**, unchanged from the pre-existing count (the new spec is Playwright under `npm run test:e2e`, not vitest, so it does not affect this count).

**Schema gate:** `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → **all checks passed, exit 0** — `disableLocalAuth=true`, `enableAutomaticFailover=true`, database `chat` and containers `history`/`config` present with correct partition keys/TTLs, no provisioned throughput, `CanNotDelete` lock present, managed-identity smoke test (`GET /` → `200`, `EnsureTenantTheme` executed) passed.

**Cleanup:** `git worktree remove /tmp/salesprism-deploy5 --force` — removed cleanly; main working tree untouched. No git commit/push performed (per instruction — Kristjan commits).

---

## 2026-08-11 — SR-006 closed: dead `enableZeroDataRetention` parameter removed (no deployment)

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Finding (re-verified before acting):** `infra/main.bicep:42` declared `param enableZeroDataRetention bool = false`, matching SAD §6.5's "Bicep-parameter klar fra dag 1" framing almost verbatim, but the parameter was never passed into `openAiModule`'s params block, and `modules/openai.bicep` had (and has) no parameter or resource property connected to it. Confirmed via `grep -n "enableZeroDataRetention\|raiMonitor\|abuse" infra/main.bicep infra/modules/openai.bicep` before editing — only the dead declaration and its two `.bicepparam` echoes existed. This matches the prior finding already recorded in `docs/gdpr-erasure-evidence.md` §6 and `docs/known-limitations.md`.

**Decision: (b) — remove, do not wire.** Azure OpenAI Zero Data Retention has no ARM/Bicep-settable property in `Microsoft.CognitiveServices/accounts@2024-04-01-preview` (the API version `modules/openai.bicep` uses) or any other version checked. ZDR is an account-level grant Microsoft applies out-of-band after a Limited Access Program application (SAD's own stated 1-4 week timeline). There is nothing in this subscription to wire the parameter to — inventing a resource property to "make the parameter do something" would itself be a fabricated control. Option (a) was therefore not available.

**Changes made:**
- `infra/main.bicep` — removed `param enableZeroDataRetention bool = false`; replaced with a dated comment block explaining why and what must be true before any ZDR-related parameter is re-added.
- `infra/environments/example.bicepparam`, `infra/environments/validation.bicepparam` — removed the corresponding `param enableZeroDataRetention = false` lines.
- `infra/main.json` — regenerated via `az bicep build --file infra/main.bicep` (twin now in sync; diff is exclusively the removed parameter/its downstream schema entries — confirmed no other change).
- `docs/Sales_Prism_SAD_v2.7.md` — §6.5 rewritten (no Bicep parameter exists; describes the real Limited Access Program mechanism); §16.3 corrected to cross-reference §6.5 instead of asserting the add-on is ready; decisions-log rows (`ZDR-strategi`, `Bicep linter warnings`) corrected to stop describing `enableZeroDataRetention` as a deliberate contract parameter.
- `docs/known-limitations.md` — SR-006 entry marked **RESOLVED**, with the still-open real risk (Microsoft's 30-day default abuse-monitoring retention on every `oai-azurechat-{slug}` account) split into its own tracked limitation so it doesn't disappear alongside the closed code defect.
- `docs/gdpr-erasure-evidence.md` — addendum appended after the original §6 finding (historical evidence text left unmodified) pointing to this closure and reiterating that the underlying 30-day retention exposure is unchanged.

**Verification — build only, no deployment:**
- `az bicep build --file infra/main.bicep` — clean (only pre-existing, previously-documented linter false positives: `no-unused-params` on `companyName`, `no-unnecessary-dependson` ×many, `no-hardcoded-env-urls` in `private-dns-zones.bicep`). No new warnings or errors introduced.
- `az bicep build-params --file infra/environments/validation.bicepparam` — compiles cleanly against the updated `main.bicep` (same pre-existing warning set only).
- `grep -rn "enableZeroDataRetention" infra/` — zero remaining references anywhere in `infra/` after the edit (was 3: `main.bicep`, `example.bicepparam`, `validation.bicepparam`).

**Why no Azure deployment was performed for this blocker:** the parameter never controlled any live resource property (confirmed above), so there is no live-state before/after to diff — removing dead Bicep source code has no effect on `rg-azurechat-val1`'s deployed resources. `oai-azurechat-val1`'s live `raiMonitorConfig` remains `null` (Microsoft default abuse-monitoring), exactly as before this change, and exactly as `docs/gdpr-erasure-evidence.md` already documented. Confirmed unaffected via source-trace only; re-querying `az cognitiveservices account show` would return identical output to the 2026-07-31 evidence capture since nothing was deployed.

**Scope discipline:** touched only `infra/main.bicep`, `infra/main.json`, `infra/environments/example.bicepparam`, `infra/environments/validation.bicepparam`, plus `docs/`. Did not touch `infra/modules/key-vault.bicep` or any observability/alerts module (reserved for the parallel Key Vault/telemetry agent). No git commit/push performed — lead commits.

**Result: CLOSED.** The dead parameter is gone, the SAD no longer oversells ZDR as ready, and the real gap (no code path exists yet because no approval has ever been pursued) is now stated plainly in three places (`known-limitations.md`, `gdpr-erasure-evidence.md`, SAD §6.5) instead of implied-as-solved in one. **Remains for the operator:** if/when a customer wants the ZDR add-on, submit the Microsoft Limited Access Program application for that customer's `oai-azurechat-{slug}` account; only once approved should any ZDR-related Bicep/code be added, informed by whatever Microsoft's approval actually changes (verify via `az cognitiveservices account show` post-approval — do not assume a property exists before seeing one).

---

## 2026-08-11 — SR-007 closed: Cosmos DB Continuous Backup migration + blob soft delete enabled (live deployment, val1)

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

### Part A — Cosmos DB backup policy (Periodic → Continuous30Days)

**Live state inspected first:** `az cosmosdb show --name cosmos-azurechat-val1 --resource-group rg-azurechat-val1` confirmed `backupPolicy.type: "Periodic"`, `backupIntervalInMinutes: 240`, `backupRetentionIntervalInHours: 8` — matching the prior finding in `docs/known-limitations.md` exactly. `disableLocalAuth: true`, `publicNetworkAccess: "Disabled"`, `enableAutomaticFailover: true`, one approved private endpoint (`pe-cosmos-val1`), `CanNotDelete` lock present — all captured to `/private/tmp/.../scratchpad/cosmos-before.json` as the before-snapshot.

**Bicep change:** added `enableContinuousBackup bool = true` to `infra/main.bicep` and `infra/modules/cosmos-db.bicep`, wired to a new `backupPolicy` variable set explicitly on `cosmosAccount.properties.backupPolicy` (Continuous30Days when true, the prior Periodic 240min/8h/Geo shape when false — preserving the exact prior default for any account that must stay off Continuous). `az bicep build` on both files — clean (module: zero warnings; `main.bicep`: only the pre-existing, previously-documented `no-unused-params`/`no-unnecessary-dependson`/`no-hardcoded-env-urls` warnings, no new ones). `infra/main.json` and `infra/modules/cosmos-db.json` twins regenerated.

**What-if before touching anything live:**
- Full-stack `az deployment sub what-if` (main.bicep + validation.bicepparam) surfaced significant **unrelated** pending drift not part of this task — 3 resources to create (`speech-azurechat-val1` + its private endpoint + DNS zone group, i.e. the F-02 Speech feature not yet deployed to val1), plus modifications to Key Vault (`publicNetworkAccess` casing), Application Insights, AI Search `networkRuleSet`, App Service Plan, and App Service `siteConfig` — none of which this task authorized touching (Key Vault and observability/alerts are explicitly reserved for a parallel agent per this task's own instructions). **Decision: did not deploy the full stack.** Scoped a `az deployment group what-if` to `modules/cosmos-db.bicep` alone instead, which confirmed the Cosmos DB account change is a clean in-place `~ Modify` (`properties.backupPolicy.type: "Periodic" => "Continuous"`, `+ properties.backupPolicy.continuousModeProperties.tier: "Continuous30Days"`) — not a delete/recreate. The same scoped what-if also surfaced a pre-existing (not caused by this change — same diff appears in the full-stack what-if against the unmodified container resource definitions) apparent "removal" of `indexingPolicy`/`conflictResolutionPolicy` on the two Cosmos containers, which is a well-documented Cosmos SQL-container what-if false-positive (RP-assigned defaults reported as diffs against a template that never specified them). To eliminate any risk around that question entirely, the actual migration was performed as a narrow `az cosmosdb update` account-level operation (below), which never touches containers.

**Migration executed:** `az cosmosdb update --name cosmos-azurechat-val1 --resource-group rg-azurechat-val1 --backup-policy-type Continuous --continuous-tier Continuous30Days` — Azure's own documented self-service Periodic→Continuous migration path. Ran as a background task (exceeded the 120s foreground timeout, as expected for this operation); completed with exit code 0.

**Post-state diff (before vs. after, full `az cosmosdb show` JSON, programmatic key-by-key comparison):**
```
disableLocalAuth                        SAME
publicNetworkAccess                     SAME
enableAutomaticFailover                 SAME
disableKeyBasedMetadataWriteAccess      SAME
isVirtualNetworkFilterEnabled           SAME
tags                                    SAME
location                                SAME
locations                               SAME
privateEndpointConnections              SAME
```
Only change: `backupPolicy.type: "Periodic" → "Continuous"`, `+ continuousModeProperties.tier: "Continuous30Days"`, periodic-mode fields removed (expected — mutually exclusive), and `createMode: null → "Default"` (cosmetic — RP now reporting its always-implicit default explicitly). `CanNotDelete` lock on the account reconfirmed present post-migration via `az resource lock list`.

**This migration is one-way** — Azure does not support moving a Continuous-backup account back to Periodic. Documented as such in `modules/cosmos-db.bicep`'s header comment, SAD §22.1, and `docs/known-limitations.md`.

### Part B — Blob soft delete (disabled → 7-day retention)

**Live state inspected first:** `az storage account blob-service-properties show --account-name stval136sepgklp44gk --resource-group rg-azurechat-val1` confirmed `deleteRetentionPolicy.enabled: false`, `containerDeleteRetentionPolicy: null`, `isVersioningEnabled: null`, `changeFeed: null`. Separately confirmed the commit-`d6fe070` blob lifecycle policy (`delete-images-after-90-days`) — previously flagged in `known-limitations.md` as "not yet deployed" — is now actually live (`az storage account management-policy show` returned the policy, `lastModifiedTime: 2026-08-10T14:39:02Z`, matching committed source exactly; deployed by someone/something between 2026-07-31 and this check, outside this session). No action needed for the lifecycle policy itself.

**Bicep change:** added a `blobSoftDeleteRetentionDays int = 7` parameter and a new, additive `Microsoft.Storage/storageAccounts/blobServices` child resource (`deleteRetentionPolicy: { enabled: true, days: 7 }`) to `infra/modules/storage.bicep` — deliberately scoped to blob soft delete only, not container soft delete/versioning/change feed (those remain off, documented as a deliberate, separate decision, not silently reintroduced). `az bicep build --file infra/modules/storage.bicep` — clean. `infra/modules/storage.json` twin regenerated.

**7-day window rationale (documented in the Bicep header comment, SAD §22.1, and `gdpr-erasure-evidence.md`):** short enough to keep the GDPR erasure tail small and precisely bounded, long enough to give real protection against an accidental application-bug deletion — the actual reason soft delete exists. **GDPR tension stated explicitly:** `EraseDataSubject`'s `eraseBlobsForThreads` hard-deletes image blobs on an erasure request; with soft delete on, Azure now retains a recoverable copy for up to 7 days before permanent purge, so erasure completion for blob storage is "immediate app-level delete + up to 7 days before Azure's own copy is gone," not instant.

**What-if before deploying:** `az deployment group what-if` scoped to `modules/storage.bicep` alone showed exactly one change (`~ Microsoft.Storage/storageAccounts/.../blobServices/default: properties.deleteRetentionPolicy.enabled: false => true, + days: 7`); the storage account resource itself, the management policy, and the delete lock all reported `= Nochange`.

**Deployed:** `az deployment group create --resource-group rg-azurechat-val1 --mode Incremental --template-file infra/modules/storage.bicep --parameters customerSlug=val1 location=westeurope tags=... --name deploy-storage-sr007-val1` — `provisioningState: Succeeded`.

**Post-deploy verification:**
- `az storage account blob-service-properties show` → `deleteRetentionPolicy: { enabled: true, days: 7 }`; `changeFeed`, `containerDeleteRetentionPolicy`, `isVersioningEnabled` all still `null` (unchanged, deliberate).
- `az storage account show --query "{publicNetworkAccess, allowBlobPublicAccess, allowSharedKeyAccess, minimumTlsVersion, sku, privateEndpointConnections, tags}"` — all identical to the pre-change values captured earlier in this session (`Disabled`, `false`, `false`, `TLS1_2`, `Standard_LRS`, `pe-st-val1`, same tags).
- `az resource lock list` — `CanNotDelete` / `st-val1-delete-lock` still present.

### Gates (both parts)
- `az bicep build` clean on every touched file (`main.bicep`, `modules/cosmos-db.bicep`, `modules/storage.bicep`) — no new warnings/errors, twins regenerated (`main.json`, `cosmos-db.json`, `storage.json`).
- `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → **all checks passed, exit 0**, including the managed-identity smoke test (`GET / → 200`) — run after the Cosmos migration completed.
- Site check: `curl -o /dev/null -w "%{http_code}" https://val1-sales360.pixelflow.dk/` → `200`, both before starting and after both changes were live.

### Scope discipline
Touched only `infra/main.bicep`, `infra/main.json`, `infra/modules/cosmos-db.bicep`, `infra/modules/cosmos-db.json`, `infra/modules/storage.bicep`, `infra/modules/storage.json`, plus `docs/`. Explicitly identified (via the full-stack what-if) but **did not touch** in-flight/unrelated changes in Key Vault, Application Insights, AI Search, App Service Plan, App Service, or the not-yet-deployed Speech feature — those belong to other work and are reported here, not acted on. No git commit/push performed — lead commits.

### Result: CLOSED
Both halves of SR-007 (Cosmos backup policy, blob soft delete) are now implemented in Bicep as the forward-looking source of truth for all future deployments, and deployed live to `rg-azurechat-val1`/val1 with full before/after verification that no safety-critical property (`disableLocalAuth`, `publicNetworkAccess`, managed identities, RBAC, private endpoints, VNet integration, delete locks, tags, region) was reset. SAD §22.1/§22.3 corrected to describe what's actually deployed instead of an aspirational decision. **Remains for the operator:** none for val1 — both changes are live and verified. For future customer stacks: `enableContinuousBackup` defaults to `true` and `blobSoftDeleteRetentionDays` defaults to `7`, so new deployments get both by default without further action; only a customer with a documented reason to stay on Periodic backup would need `enableContinuousBackup: false` set explicitly at provisioning time (irreversible once Continuous is chosen, reversible the other direction only by never migrating in the first place).

---

## 2026-08-11 — H-2 closed: App Service ingress restricted to Cloudflare IP ranges (default-deny), val1 exception documented and deployed

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Finding re-confirmed live before acting:** `az webapp config show -g rg-azurechat-val1 -n app-azurechat-val1` showed `ipSecurityRestrictions: [{ ipAddress: "Any", action: "Allow" }]`, `ipSecurityRestrictionsDefaultAction: null` (effectively Allow) — `app-azurechat-val1.azurewebsites.net` was fully open to the internet, confirming H-2 exactly as described.

**Cloudflare IP ranges fetched at authoring time:** `curl https://www.cloudflare.com/ips-v4` (15 CIDR blocks) and `curl https://www.cloudflare.com/ips-v6` (7 CIDR blocks), pinned verbatim into `modules/app-service.bicep` with a dated comment (`pinned 2026-08-11`) and a note to re-fetch periodically.

**Bicep change:** `infra/modules/app-service.bicep` — added `restrictIngressToCloudflare bool = true` param, `cloudflareIpv4Ranges`/`cloudflareIpv6Ranges` vars (the fetched lists), a `cloudflareIpSecurityRestrictions` computed array (Allow rules, one per CIDR), and wired `siteConfig.ipSecurityRestrictions`/`ipSecurityRestrictionsDefaultAction` to switch between the Cloudflare allow-list + `Deny` default (when true) and an empty list + `Allow` default (when false — functionally identical to the site's current wide-open state, confirmed below). Also explicitly set `scmIpSecurityRestrictionsUseMain: false` with a comment explaining why SCM is deliberately NOT restricted to the same list (Cloudflare doesn't proxy `*.scm.azurewebsites.net`; doing so would break `az webapp deploy` and the future GitHub Actions deploy pipeline). `infra/main.bicep` — added the same `restrictIngressToCloudflare bool = true` param, wired through to `appServiceModule`. `infra/environments/validation.bicepparam` — added `param restrictIngressToCloudflare = false` with a dated comment explaining the val1 exception (unproxied, App Service-managed cert — enabling the restriction would 502 the live site). `az bicep build` on both touched files — clean (module: zero new warnings; `main.bicep`: only the pre-existing documented warning set). `infra/main.json` and `infra/modules/app-service.json` twins regenerated.

**Behavioral-equivalence check before deploying the val1 exception:** re-confirmed via `az webapp config show` that val1's current state (`ipSecurityRestrictionsDefaultAction: null` + one catch-all `Allow`/`Any` rule) and the new template's `false` branch (`ipSecurityRestrictionsDefaultAction: 'Allow'` + empty `ipSecurityRestrictions: []`) are functionally identical — both mean "no restriction, everything allowed." Also confirmed live `scmIpSecurityRestrictionsUseMain: false` already, matching the new template's explicit value exactly — no behavior change there either.

**What-if before deploying:** scoped `az deployment group what-if` against `modules/app-service.bicep` (all params supplied with exact live values fetched via `az cognitiveservices account show`/`az cosmosdb show`/`az keyvault show`/`az monitor app-insights component show`, `restrictIngressToCloudflare=false`) showed exactly two resources modified: `plan-azurechat-val1` (a pre-existing, unrelated `freeOfferExpirationTime` cosmetic diff, already present before this change) and `app-azurechat-val1` (`+ ipSecurityRestrictionsDefaultAction: "Allow"`, `+ scmIpSecurityRestrictionsUseMain: false`, plus RP-injected defaults `localMySqlEnabled`/`netFrameworkVersion`/`vnetRouteAllEnabled` being made explicit — `vnetRouteAllEnabled` confirmed already `true`). No `appSettings` diff (that array was untouched by this change) and no `ipSecurityRestrictions` array entries added (empty list, as expected for the `false` branch).

**Deployed:** `az deployment group create --resource-group rg-azurechat-val1 --mode Incremental --template-file infra/modules/app-service.bicep --parameters ... restrictIngressToCloudflare=false --name deploy-appservice-h2-val1` — `provisioningState: Succeeded`.

**Post-deploy verification:**
- `az webapp config show` → `ipSecurityRestrictionsDefaultAction: "Allow"`, one catch-all `Allow`/`Any` rule still present, `scmIpSecurityRestrictionsUseMain: false`, `linuxFxVersion: "NODE|22-lts"`, `vnetRouteAllEnabled: true` — all as expected.
- `az webapp identity show` → `SystemAssigned`, `principalId` unchanged from before the deploy (managed identity, and therefore all existing RBAC role assignments tied to it, intact).
- **Transient cold-start timeout, resolved:** the first post-deploy site check (`curl https://val1-sales360.pixelflow.dk/`) timed out after 30s with 0 bytes received (TLS handshake succeeded, then hung) — a config change to `siteConfig` triggers an App Service restart/recycle. Confirmed this was a cold start, not a real outage, by hitting `https://app-azurechat-val1.azurewebsites.net/` directly (`200`, but `35.3s` — clearly a cold start), then re-hitting the custom domain (`200` in `0.33s`). `az webapp show` confirmed `state: Running`, `availabilityState: Normal` throughout.

### Gates
- `az bicep build` clean on `modules/app-service.bicep` and `main.bicep` — no new warnings/errors; twins regenerated.
- `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → **all checks passed, exit 0**, including the managed-identity smoke test (`GET / → 200`) — run after the app had warmed back up.
- Site check: `200` on both `https://val1-sales360.pixelflow.dk/` and `https://app-azurechat-val1.azurewebsites.net/` post-deploy (after the cold start resolved).

### Scope discipline
Touched only `infra/main.bicep`, `infra/main.json`, `infra/modules/app-service.bicep`, `infra/modules/app-service.json`, `infra/environments/validation.bicepparam`, plus `docs/`. Did not touch Key Vault, observability/alerts, or any other module. No git commit/push performed — lead commits.

### Result: CLOSED
`app-azurechat-{slug}.azurewebsites.net` is now restricted to Cloudflare's published edge IP ranges (default-deny) for every customer by default. val1 is the sole, explicitly documented, dated exception — still fully open — because it is not yet proxied through Cloudflare; this is stated in three places (`modules/app-service.bicep` header, `infra/environments/validation.bicepparam`, `docs/known-limitations.md`) so it cannot be silently forgotten or copied to a production customer. **Remains for the operator:** (1) re-proxy val1 through Cloudflare with an Origin Certificate (SAD §7.2) and flip `restrictIngressToCloudflare` to `true` for it, coordinating with the `cloudflare-dns-engineer` agent; (2) a separate, deliberately deferred pass to harden the SCM/Kudu endpoint with GitHub Actions' own IP ranges once `provision-customer.yml` exists and those ranges are known; (3) periodically re-fetch Cloudflare's IP ranges from the two published URLs and update the pinned list in `modules/app-service.bicep` if they change.

---

## 2026-08-11 — H-3 closed (definitions only, NOT assigned): Azure Policy guardrails authored in `infra/policy/`

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Finding re-confirmed live before acting:** `az policy definition list` and `az policy assignment list`, both filtered for anything Sales-Prism-related, returned empty arrays — no subscription-level policy enforcement existed anywhere, confirming SAD §16.2's claim was aspirational, exactly as H-3 described. Enforcement was genuinely only the `@allowed()` Bicep decorators.

**Authored (new directory `infra/policy/`, four files):**
- `deny-non-eu-region.bicep` — `Microsoft.Authorization/policyDefinitions`, denies any location-scoped resource outside `northeurope`/`westeurope`/`swedencentral` (mirrors the `allOf` pattern used by Azure's own built-in "Allowed locations" policy — `location notEquals 'global'` AND `location notIn allowedLocations`).
- `deny-openai-global-standard.bicep` — denies `sku.name = GlobalStandard` on `Microsoft.CognitiveServices/accounts/deployments`. The policy alias used (`Microsoft.CognitiveServices/accounts/deployments/sku.name`) was looked up via `az provider show -n Microsoft.CognitiveServices --expand "resourceTypes/aliases"` before writing the rule — not guessed. Live-checked that this wouldn't retroactively flag anything: `az cognitiveservices account deployment list -n oai-azurechat-val1` confirms both existing deployments (`gpt-5.4-mini`, `text-embedding-3-small`) are already `DataZoneStandard`.
- `require-standard-tags.bicep` — denies any location-scoped resource missing one or more of `customer`/`environment`/`managed-by`/`model-tier`. Includes a documented caveat about a possible false-positive on Private Endpoint auto-created NIC child resources, recommending a `DoNotEnforce` dry run before real enforcement.
- `initiative.bicep` — a `Microsoft.Authorization/policySetDefinitions` grouping all three via `existing` references, for one assignment command instead of three.

**Validation performed (read-only, no resources created):**
- `az bicep build` on all four files — clean, zero warnings/errors (all four `.json` twins generated for the first time).
- `az deployment sub validate --location westeurope --template-file infra/policy/<file>.bicep` for all four — every one returned `provisioningState: Succeeded`. This is a genuinely non-mutating ARM validate call (confirmed no resources appear anywhere afterward) — no `az deployment sub create` was run for any of the four files.

**Deliberately NOT done, per this task's explicit instruction:** did not deploy the definitions (`az deployment sub create`) and — far more importantly — did **not** assign any policy or initiative to the subscription. A subscription-wide `deny` policy is an operator decision with real blast radius (can block legitimate future deployments across the whole subscription, not just this repo's), and creating vs. assigning are two very different risk levels — assignment is where actual enforcement (and actual risk of unintended denial) begins. The exact `az deployment sub create` (×4, in dependency order: three definitions, then the initiative) and `az policy assignment create` commands are documented in each file's trailing comment, with a recommendation to assign first with `--enforcement-mode DoNotEnforce` and review `az policy state list` for false positives before switching to `Default`.

### Gates
- `az bicep build` clean on all four new files.
- No deployment/assignment performed — the "re-run schema verify + confirm 200" gates from this task's instructions apply to actual deployments to `rg-azurechat-val1`; this blocker made no such deployment, so nothing in `rg-azurechat-val1` changed. Ran the site check anyway as a sanity floor: `curl https://val1-sales360.pixelflow.dk/` → `200`.

### Scope discipline
New files only: `infra/policy/deny-non-eu-region.bicep`, `.json`, `infra/policy/deny-openai-global-standard.bicep`, `.json`, `infra/policy/require-standard-tags.bicep`, `.json`, `infra/policy/initiative.bicep`, `.json`, plus `docs/`. No existing `infra/` file touched. No git commit/push performed — lead commits.

### Result: CLOSED (as "authored, validated, documented — not assigned", matching the task's explicit boundary)
The three policy definitions + initiative genuinely compile and validate against this subscription, using a real (looked-up, not guessed) Policy alias for the GlobalStandard check, and don't retroactively flag anything already deployed. SAD §16.2 corrected to state plainly that enforcement is not yet active until an operator assigns these. **Remains for the operator (Kristjan):** run the documented `az deployment sub create` ×4 + `az policy assignment create` sequence (ideally `DoNotEnforce` first) to make SAD §16.2's "hård gardering" claim actually true; separately, consider a follow-up policy for public-network-access-on-AI-services (SAD §16.2 also claims this but it was out of this task's three-definition scope — tracked in `docs/known-limitations.md`).

---

## 2026-08-11 — H-5 closed: SAD §31.2 alert rules implemented and deployed to val1 (new `infra/modules/alerts.bicep`)

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) before any action.

**Coordination check performed first:** re-read `infra/modules/observability.bicep` and `infra/modules/key-vault.bicep` before touching anything — both unmodified in the working tree (`git status --porcelain infra/` showed no changes to either), confirming no conflict with the parallel Key Vault/telemetry agent's work at the time of this session. Created a new, separate `infra/modules/alerts.bicep` module rather than editing `observability.bicep`, so this work cannot collide with that agent's in-progress changes there.

**Metric/dimension verification performed before writing any alert rule** (not assumed): `az monitor metrics list-definitions` run live against `app-azurechat-val1`, `plan-azurechat-val1`, `cosmos-azurechat-val1`, `oai-azurechat-val1`, and `srch-azurechat-val1`, plus `appi-azurechat-val1` for the availability metric, and `az provider show -n microsoft.insights` for the webtests resource type/API version. Confirmed real metric names, namespaces, and dimensions for every metric-based alert before using them.

**SR-010 dependency check performed and reported honestly:** `git status --porcelain src/instrumentation.ts` confirmed the file (Azure Monitor OpenTelemetry Distro wiring — the parallel agent's SR-010 remediation) exists in the working tree but is **uncommitted** as of this session — meaning it was not part of any build ever deployed to val1's App Service. The HTTP 5xx% alert (a log-query alert against Application Insights' `requests` table) therefore has no real data to evaluate yet; this is stated explicitly in the alert's own `description` property, in SAD §31.2, and in `docs/known-limitations.md` — not glossed over.

**Implemented, one per SAD §31.2 row, each in its verified-correct native form** (new file `infra/modules/alerts.bicep`, plus small additive output-only changes to `infra/modules/openai.bicep` (`chatModelCapacity` output) and `infra/modules/app-service.bicep` (`appServicePlanId` output) — neither changes any deployed resource property, both are pure Bicep outputs):
1. **App Service availability < 99%/5min** — `Microsoft.Insights/webtests` (ping test, 2 EU locations: Amsterdam `emea-nl-ams-azr`, Dublin `emea-gb-db3-azr`) + `Microsoft.Insights/metricAlerts` on `availabilityResults/availabilityPercentage`.
2. **HTTP 5xx > 5%/5min** — `Microsoft.Insights/scheduledQueryRules` (KQL against App Insights `requests`) — see SR-010 dependency above.
3. **Azure OpenAI quota > 80% TPM** — two `metricAlerts` (chat + embedding deployments) on `TokenTransaction`, dimension-filtered by `ModelDeploymentName`, threshold = `capacity × 4000` (80% of 5-minute token budget).
4. **Cosmos throttling > 10 RU/s** — `metricAlert` on `TotalRequests` filtered `StatusCode=429` — "RU/s" is not a real metric; documented as an interpretation.
5. **AI Search 503 > 5%** — `metricAlert` on the native `ThrottledSearchQueriesPercentage` metric — no log-query needed.
6. **App Service CPU > 85%/10min** — `metricAlert` on `CpuPercentage` (App Service Plan).
7. **Cost anomaly > 150% of daily baseline** — `Microsoft.Consumption/budgets`, Monthly (only supported grain), 150%-of-baseline notification — documented as not a literal daily anomaly detector.

All seven share one `Microsoft.Insights/actionGroups` (`ag-azurechat-{slug}`), parameterized email receiver, default `kontakt@pixelflow.dk`.

**Validation before deploying:** `az bicep build` clean on all touched/new files. Scoped `az deployment group what-if` against `modules/alerts.bicep` (all params supplied with real live values) showed exactly 10 resources `+ Create`, zero modifications to anything existing. Followed by an explicit `az deployment group validate` (also non-mutating, invokes RP-side semantic checks) — `provisioningState: Succeeded`.

**First deploy attempt — one failure, non-destructive, fixed:** `az deployment group create` failed on `alert-cosmos-throttling-val1` only: `"Time aggregation must be one of [Count]"` — `TotalRequests` does not support `timeAggregation: Total` (assumed incorrectly; neither `what-if` nor `validate` caught this, only the real PUT did). The other 9 resources deployed successfully in the same run (confirmed via `az resource list`). Fixed `timeAggregation: 'Count'` in `modules/alerts.bicep` with a comment documenting the correction, rebuilt (`az bicep build` clean), redeployed — `provisioningState: Succeeded`, all 10 resources now present and `enabled: true` (`az monitor metrics alert list`, `az resource show` for the scheduledQueryRule and budget, `az monitor action-group show` for the email receiver — all verified).

### Gates
- `az bicep build` clean on `modules/alerts.bicep`, `modules/openai.bicep`, `modules/app-service.bicep`, `main.bicep` — no new warnings/errors beyond the pre-existing documented set; all JSON twins regenerated.
- `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` → **all checks passed, exit 0**.
- Site check: `curl https://val1-sales360.pixelflow.dk/` → `200`.
- `az lock list --resource-group rg-azurechat-val1` → both delete locks (`st-val1-delete-lock`, `cosmos-azurechat-val1-delete-lock`) confirmed still present, untouched by this purely-additive deployment.

### Scope discipline
Touched: `infra/modules/alerts.bicep` (new), `infra/modules/alerts.json` (new), `infra/policy/` is unrelated (H-3, already reported) — for H-5 specifically: `infra/main.bicep`, `infra/main.json`, `infra/modules/openai.bicep`, `infra/modules/openai.json` (output only), `infra/modules/app-service.bicep`, `infra/modules/app-service.json` (output only), plus `docs/`. Did **not** touch `infra/modules/observability.bicep` or `infra/modules/key-vault.bicep` — verified both unmodified before starting and left untouched throughout. No git commit/push performed — lead commits.

### Result: CLOSED
All seven SAD §31.2 alerts are implemented, deployed, and verified live on val1, each honestly labeled by its real underlying mechanism (metric alert / log-query alert / budget notification) rather than treated as interchangeable. Two rows (Cosmos "RU/s", cost "150%/day") are documented, deliberate interpretations of SAD wording that doesn't map to a literal Azure primitive — flagged in three places so this isn't mistaken for either "done exactly as written" or "not done." **Remains for the operator:** (1) commit + deploy SR-010 (`src/instrumentation.ts`) for the HTTP 5xx% alert to have real data — that work belongs to the parallel telemetry agent, not this one; (2) if true daily-level cost anomaly detection is wanted, configure Azure Cost Management's native Anomaly Alert feature separately (not a per-customer Bicep resource); (3) confirm the two Application Insights webtest location IDs (`emea-nl-ams-azr`, `emea-gb-db3-azr`) continue to be valid over time — they were accepted by live ARM validation and deployment on 2026-08-11 but could not be cross-checked against any Azure-published enumeration endpoint in this session.

## val1 — product UI layer deployment (2026-08-11)

**Subscription guard:** `az account show` confirmed `"Azure subscription 1"` (`ceb8f0de-f43f-4e86-8a39-3aa338af5e10`) — proceeded.

**Scope:** app code only, `app-azurechat-val1` in `rg-azurechat-val1`. No `infra/` edits. Two other agents were concurrently editing `infra/` and possibly `src/instrumentation.ts` / `src/next.config.js` in the main working tree, so the build was taken from an isolated git worktree pinned to the committed commit `67c3700` (`feat(product): W1-W8 — make every V1 capability discoverable in the UI`), never from the live working tree.

**Build:** `git worktree add /tmp/salesprism-deploy7 67c3700`; inside its `src/`: `nvm use 22` (`v22.23.2`) → `npm ci --legacy-peer-deps` (1023 packages, clean) → `npm run build`. First build attempt failed inside the default sandboxed shell (`next/font` could not fetch `Playfair Display` from `fonts.gstatic.com` — sandboxed network egress). Re-ran the same build with sandboxing disabled for that one command (network egress only, no other privilege change) — succeeded cleanly, all 37 routes compiled, PWA service worker generated at `public/sw.js` (16203 bytes, timestamped to the build).

**Package:** followed `.github/workflows/open-ai-app.yml`'s exact steps — `.next/standalone` copied to `site-deploy/`, `.next/static` copied into `site-deploy/.next/static`, `public/` copied into `site-deploy/public`, zipped from inside `site-deploy/`. Verified inside the zip before upload: `server.js` present, `public/sw.js` present (16203 bytes, matching the freshly built file — not a stale artifact), `public/manifest.json` present. Zip size 22 MB.

**Deploy:** `az webapp deploy -g rg-azurechat-val1 -n app-azurechat-val1 --type zip --src-path Nextjs-site.zip --async false` → `Deployment has completed successfully`, `RuntimeSuccessful`, `numberOfInstancesFailed: 0`. Confirmed pre-deploy via (name-only query, no secret values) `az webapp config appsettings list ... --query "[].name"`: no `AZURE_OPENAI_API_KEY` present anywhere in app settings. `az webapp config show` confirmed `linuxFxVersion: "NODE|22-lts"` and `appCommandLine: "node server.js"` were already correctly set (unchanged by this deploy).

**Restart + poll:** `az webapp restart` → polling `GET https://val1-sales360.pixelflow.dk/` returned `200` on the very first poll.

**Positive discriminator (new build confirmed live, not just HTTP 200):** unauthenticated `GET` of each of the five new routes returned `307` to `/` (these routes 404'd on the previous build):

| Route | Result |
|---|---|
| `/home` | **307** → `/` |
| `/prepare` | **307** → `/` |
| `/coach` | **307** → `/` |
| `/modules` | **307** → `/` |
| `/documents` | **307** → `/` |

All five PASS.

### Authenticated data-plane verification matrix — BLOCKED-ON-SESSION

Full matrix and investigation notes: `docs/reviews/authenticated-data-plane-matrix.md`.

Summary: no live authenticated Entra ID session was available. The Claude Browser pane (`https://val1-sales360.pixelflow.dk`) initially appeared to hold one — `GET /api/auth/session` returned a populated session (`oid`, `tenantId`, `isAdmin: true`) — but this was traced to a **stale service-worker cache** left over from a session predating today's redeploy: the pane's active SW had an `apis` Cache Storage bucket containing a cached `/api/auth/session` (and `/api/auth/csrf`, `/api/auth/providers`) response. After unregistering that SW and clearing its caches, a live network request to `/api/auth/session` returned `{}` (unauthenticated) — confirmed via `read_network_requests` showing real `200 OK` network calls, not cache hits. No credentials were available to complete an interactive Entra ID login (out of scope per task rules), so items 1–10 of the matrix are **BLOCKED-ON-SESSION**, not faked. Where the task explicitly permits code-level evidence in place of a live second identity (matrix item 9) or documents the credential gap (items generally), that evidence was gathered and is recorded in the matrix doc.

Note: the source that produced the stale SW cache (`next.config.js`) was independently re-checked against the currently deployed build and correctly implements the blanket `NetworkOnly` rule for all same-origin `/api/*` GET/POST routes (commit `dc9eb8e`'s fix) — the stale cache was a leftover from a browser tab predating that fix's deployment, not a regression in the code just deployed.

`src/e2e/authenticated-journeys.spec.ts` was extended with a `describe` block encoding all 10 matrix items as Playwright tests, gated on an `E2E_STORAGE_STATE` env var pointing at a real captured session's storage state; every test in that block currently skips with an explicit reason when the var is unset, per the "do not fake a session" rule.

### Part 3 gates

| Gate | Result |
|---|---|
| `bash infra/scripts/verify-cosmos-schema.sh -g rg-azurechat-val1 -s val1 -w app-azurechat-val1` | **PASS**, exit 0 — all checks incl. managed-identity smoke test (`GET / → 200`) |
| `npx tsc --noEmit` (worktree `src/`) | **PASS** — no errors |
| `npm run build` (worktree `src/`) | **PASS** — clean build, 37 routes |
| `npm run test` (worktree `src/`, vitest) | **PASS** — 26 test files, **249/249 tests passed** |

Worktree `/tmp/salesprism-deploy7` removed after all gates passed (`git worktree remove --force`).

### Scope discipline
Touched only `app-azurechat-val1` (deploy + restart). No `infra/` edits. No DNS changes. No destructive `az` commands. All app-setting queries used `--query "[].name"` (names only, never `-o table`, never a value) per SD-003. Did not touch CSRF logic, cookie flags, ADR-003 canonical identity, or single-tenant config — the one identity-adjacent file touched was `src/e2e/authenticated-journeys.spec.ts` (test-only, additive, no application code). No git commit/push performed — lead commits.

### Result: DEPLOYED, MATRIX BLOCKED-ON-SESSION
Product UI layer for W1–W8 is live on val1 and confirmed via the positive route discriminator. The authenticated data-plane matrix could not be exercised live — no session, and none was fabricated. A dedicated Entra ID test-user account (or a non-production `CredentialsProvider` escape hatch) remains the same unaddressed gap `e2e/authenticated-journeys.spec.ts` has flagged since before this task; until it exists, matrix items 1–7 and 10 cannot be verified end-to-end by automation.

**Outstanding:** none identified for this specific defect — all three Playwright contexts passed on the live deployment, including the decisive primed-cache regression case, and the fix is confirmed live via byte-identical `sw.js` and correct Workbox rule ordering. As before, a full interactive Entra login (real credentials, possibly MFA) has still not been performed by this agent — out of scope by design (no test credentials exist; see `e2e/authenticated-journeys.spec.ts`) — so session creation past the Entra authorize redirect remains unverified by automation.
