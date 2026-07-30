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
