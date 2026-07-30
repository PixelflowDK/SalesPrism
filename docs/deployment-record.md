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
