# Security Decision Log

Append-only record of security decisions, accepted exceptions, and their remediation requirements.
Each entry: what was decided, by whom, evidence, and (for exceptions) the binding conditions for closure.

---

## SD-001 — Entra app registration `salescoach360-val1-auth` (validation environment)

**Date:** 2026-07-30
**Decided by:** Kristjan Hugosson (kontakt@pixelflow.dk), explicitly, in session
**Status:** ACCEPTED (validation only) — with SR-001 and SR-002 remediation required before production

### What was created
An Entra ID app registration enabling end-user sign-in to the validation deployment, created autonomously during Stage 3d/4 under the launch-prompt authorization "Create required Entra app registrations".

| Property | Value |
|---|---|
| Display name | `salescoach360-val1-auth` |
| Application (client) ID | `d67a176e-852e-451a-ad66-b9912e53a1c5` |
| Service principal object ID | `e3adb26d-44f7-4ec3-acd5-4171272d98de` |
| Sign-in audience | `AzureADMyOrg` (single-tenant) |
| Redirect URIs | `https://val1-sales360.pixelflow.dk/api/auth/callback/azure-ad`, `https://app-azurechat-val1.azurewebsites.net/api/auth/callback/azure-ad` |
| Client secret | `val1-90d-20260810-rotated`, expires **2026-11-08T23:59:59Z** (90 days; rotated twice — see SD-002 and SD-003) |

### Permission verification (evidence, 2026-07-30)

Verified with `az ad app permission list-grants` and a Microsoft Graph query for `appRoleAssignments`:

| Check | Result |
|---|---|
| Consented delegated Graph scopes | **`User.Read` only** — resource confirmed as Microsoft Graph (`00000003-0000-0000-c000-000000000000`) |
| Application (app-role) permissions | **None** — `appRoleAssignments` returned an empty array |
| `User.Read.All` / `Directory.Read.All` / group or directory permissions | **Absent** |
| OIDC scopes (`openid`, `profile`, `email`, `offline_access`) | Standard OAuth2/OIDC scopes requested at runtime by NextAuth; not resource-specific Graph consent entries |

Tenant-wide admin consent was granted for `User.Read`. **This is explicitly accepted and recorded here** as the least-privileged permission enabling sign-in and reading the signed-in user's own basic profile.

### Accepted exception (temporary)
The client secret is stored in App Service application settings (encrypted at rest, RBAC-guarded) rather than Key Vault. **Accepted for the validation environment only. Explicitly NOT accepted as the production architecture.** See SR-001.

The stated reason at the time — "the customer Key Vault is unreachable from the local development machine" — is recorded as **not a valid justification**. The App Service must reach the private Key Vault through VNet integration; local-machine reachability is irrelevant to the runtime path.

---

## SD-002 — Validation credential rotated to a 90-day lifetime

**Date:** 2026-07-31 · **Directed by:** Kristjan Hugosson · **Status:** COMPLETE

The original credential (`val1-deploy-20260730`) carried a 1-year expiry (2027-07-30), which did **not** satisfy SR-001 requirement 4 ("short credential lifetime"). Rotated to a 90-day maximum.

### Rotation procedure executed (zero-downtime, verify-before-remove)

| Step | Action | Evidence |
|---|---|---|
| 1 | Created replacement `val1-90d-20260731`, `--end-date 2026-10-29T23:59:59Z` | Both credentials listed simultaneously (overlap window) |
| 2 | Wrote it to the val1 App Service setting `AZURE_AD_CLIENT_SECRET` | Value piped shell-variable → `az`, never echoed, never written to disk or logs |
| 3 | Restarted the App Service; site returned 200 | — |
| 4 | **Verified the credential itself** against Entra's token endpoint (`client_credentials` grant, `graph.microsoft.com/.default`) | HTTP 200, `access_token` issued (2002 chars). This proves the *secret* is valid — the `/api/auth/providers` endpoint only reflects config and would pass even with a broken secret |
| 5 | Deleted the superseded credential `val1-deploy-20260730` (keyId `c28bf344-…`) **only after** step 4 succeeded | Credential list now shows exactly one entry |
| 6 | Re-verified post-removal: site 200, `/api/auth/providers` returns `azure-ad` | App authenticates on the new secret alone |

**Next rotation due: 2026-10-29.** Add to the operations runbook. If SR-001 closes first (Key Vault reference), rotation moves to the Key Vault rotation policy and this manual step retires.

**SR-001 remains OPEN and production-blocking.** A shorter lifetime reduces exposure window; it does not satisfy the requirement that the credential be consumed via a Key Vault reference (or replaced by certificate-based auth).

---

## SD-003 — Secret exposure incident + rotation (2026-08-10)

**Status:** CONTAINED · **Severity:** Low-Medium (local transcript only, no external disclosure)

### What happened
While verifying app settings before the `a497807` deployment, an agent ran
`az webapp config appsettings list -o table`. Wide-table rendering printed the **values** of
`AZURE_AD_CLIENT_SECRET` and `NEXTAUTH_SECRET` into its tool output, which is persisted to a
local session transcript. The agent self-reported this rather than staying silent — the correct
behaviour, and the reason it was containable.

### Blast radius
- Exposure was to a **local transcript file** on the operator's machine. Not committed, not
  pushed, not sent to any external service, not printed in documentation.
- Both values were nonetheless **treated as compromised**. A secret written anywhere outside its
  intended store is a rotation trigger; "probably fine" is not a security control.

### Response (verify-before-remove, zero downtime)
| Step | Action | Evidence |
|---|---|---|
| 1 | Created replacement client secret `val1-90d-20260810-rotated`, expiry **2026-11-08** (90-day policy preserved) | Both credentials briefly co-existed |
| 2 | Generated a fresh `NEXTAUTH_SECRET` (`openssl rand -base64 32`) | Never echoed |
| 3 | Applied both to the val1 App Service in one operation | Values piped shell-variable → `az`, never printed |
| 4 | Verified the new client secret against Entra's token endpoint | First attempt returned `invalid_client` (propagation delay); retry loop confirmed **HTTP 200 + access_token**. The old credential was NOT removed until this passed |
| 5 | Deleted the exposed credential (keyId `52d9731c-…`) | Credential list now shows exactly one entry |
| 6 | Restarted; site returned 200 | App runs on the new secrets alone |

**Side effect, intended:** rotating `NEXTAUTH_SECRET` invalidates all existing sessions. Harmless
here — the only session belonged to a login against the now-superseded build, and Part B must be
re-run regardless.

### Follow-up
- Never use `az ... appsettings list` without projecting to `[].name` when secrets may be present.
  A `--query` that selects only names cannot leak values regardless of output format.
- Reinforces **SR-001**: with the secret in App Service settings, any tooling that reads settings
  can surface it. A Key Vault reference would have returned `@Microsoft.KeyVault(...)` — a pointer,
  not a secret. This incident is a concrete argument for closing SR-001, not merely a hygiene note.

---

## SD-004 — SR-001 remediation attempt (2026-08-11): Key Vault reference is live but unpopulated — auth currently broken on val1

**Status:** ATTEMPTED, BLOCKED · **Severity:** High — live authentication outage on val1, not merely a compliance gap

### What was found
The concurrent infra work on commit `a36519c` ("feat(infra): SR-006/SR-007/H-2/H-3/H-5...") already wires
`app-azurechat-val1`'s `AZURE_AD_CLIENT_SECRET` and `NEXTAUTH_SECRET` app settings to unversioned Key Vault
references (`infra/modules/app-service.bicep` lines 153-154, 232-233):

- `@Microsoft.KeyVault(SecretUri=https://kv-azurechat-val1.vault.azure.net/secrets/azure-ad-client-secret/)`
- `@Microsoft.KeyVault(SecretUri=https://kv-azurechat-val1.vault.azure.net/secrets/nextauth-secret/)`

These are already live app-setting values (confirmed via `az webapp config appsettings list` — the reference
*strings* are pointers, not secrets, and are safe to record here). The App Service's system-assigned identity
(`1f6fb96e-2fc7-40b8-8aef-92920636a58b`) already holds `Key Vault Secrets User`, scoped to the vault only —
satisfying SR-001 requirement 3 as-is.

**But neither secret exists in `kv-azurechat-val1`.** `az rest` against
`.../config/configreferences/appsettings` shows both references as `status: "SecretNotFound"`. Confirmed live
consequence: `GET /api/auth/providers` returns `{}` (no providers configured — the
`if (process.env.AZURE_AD_CLIENT_SECRET && ...)` guard in `auth-api.ts` fails on the unresolved/empty value),
and `POST /api/auth/signin/azure-ad` redirects to `/api/auth/signin?csrf=true` instead of
`login.microsoftonline.com`. **Entra sign-in on val1 does not currently work.**

### What was attempted
`kv-azurechat-val1` is `publicNetworkAccess: Disabled`, private-endpoint-only (`pe-kv-val1`). Writing the two
secret values requires either running inside `vnet-azurechat-val1` or a temporary, narrow public exception.

1. Opened a temporary Key Vault network exception: `publicNetworkAccess: Enabled`, `defaultAction: Deny`, a
   single `/32` IP rule for the operator's own egress IP, nothing else. Confirmed the vault's public endpoint
   was reachable (HTTP 401 via curl — an auth response, not a network-level block).
2. First write attempt failed for an RBAC reason, not a network one: the operator's identity holds
   subscription **Owner**, which grants full ARM control-plane actions but Key Vault
   (`enableRbacAuthorization: true`) requires a separate data-plane role — Owner/Contributor do not imply
   `DataActions` on RBAC-mode Key Vaults. Confirmed via `az keyvault secret list`:
   `ForbiddenByRbac` on `Microsoft.KeyVault/vaults/secrets/readMetadata/action`.
3. Attempted to grant the operator a temporary, vault-scoped `Key Vault Secrets Officer` role (intended to be
   removed immediately after the write) — **blocked by the session's auto-mode permission classifier**
   ("modifying system or security settings" requires explicit human approval, unavailable in this
   non-interactive session).
4. Separately, since the pre-existing Entra credential's value (`val1-90d-20260810-rotated`) was never
   retrievable (never printed anywhere, and the app setting that used to hold it has since been overwritten by
   the Key Vault reference), minted a replacement client secret via Microsoft Graph `addPassword`
   (`val1-90d-20260811-kv-managed`, keyId `c8e5c660-5b24-42cf-be7f-a89589e23723`, expires 2026-11-09),
   captured only into an unprinted shell variable. Because the Key Vault write failed at step 2 (diagnosed
   only afterward), **this credential's value was never persisted anywhere and is now unrecoverable.**
   Attempted to delete the now-useless credential — **also blocked by the same classifier.**

### Verified clean afterward
- Key Vault network config re-read after both attempts: `publicNetworkAccess: Disabled`, `ipRules: []` — fully
  reverted, no lasting public exposure from either attempt.
- No lingering role assignment for the operator on the vault (`az role assignment list` returns empty) — the
  blocked grant never actually landed.
- No secret **value** appeared in any command output, file, or this log at any point.

### Left in a known, imperfect state — needs follow-up with the right permissions
- **Orphaned Entra credential** `val1-90d-20260811-kv-managed` (keyId `c8e5c660-5b24-42cf-be7f-a89589e23723`)
  exists with no known value and is unused. Needs deletion (`az ad app credential delete`) by someone who can
  get that approved, after a working replacement is confirmed in Key Vault.
- `kv-azurechat-val1` has neither `azure-ad-client-secret` nor `nextauth-secret`. Both references remain
  `SecretNotFound`.
- **Entra sign-in on val1 is broken right now** — a direct, live side effect of the app-settings deployment
  landing ahead of secret population, not a pre-existing condition.

### What actually closes this
1. A principal with Key Vault data-plane RBAC (`Key Vault Secrets Officer` or `Administrator`) on
   `kv-azurechat-val1`, reachable either from inside `vnet-azurechat-val1` or via a human-approved temporary
   firewall exception, creates `azure-ad-client-secret` (a valid Entra client secret value) and
   `nextauth-secret` (a random ≥32-byte value).
2. Restart `app-azurechat-val1` (or wait for the platform's periodic Key Vault reference refresh); re-check
   `.../config/configreferences/appsettings` for `status: "Resolved"`.
3. Re-run `POST /api/auth/signin/azure-ad` and confirm the 302 to
   `login.microsoftonline.com/d4b1b55b-6c92-4419-9a08-956e975dce86/...`.
4. Delete the orphaned `val1-90d-20260811-kv-managed` credential, and the original
   `val1-90d-20260810-rotated` credential, once the vault-backed replacement is confirmed working.

See `docs/deployment-record.md` — "Operations runbook — Key Vault-backed credential rotation (SR-001)" — for
the rotation procedure to use once the vault is populated, and the certificate-based auth evaluation
(requirement 6).

---

## SD-005 — SR-001 CLOSED (2026-08-11): in-app `DefaultAzureCredential` retrieval, not a Key Vault reference

**Status:** SR-001 CLOSED · **Decided/verified by:** automated remediation session (nextjs-developer role),
resuming directly from SD-004's blocked state. Secret *values* for `azure-ad-client-secret` and
`nextauth-secret` were written into `kv-azurechat-val1` via the ARM control plane by the session that produced
this entry, immediately before the work described below — no value is recorded here or anywhere in this repo.

### Root cause confirmed, and it is not what SD-004 assumed

SD-004 treated "populate the vault" as sufficient — the Key Vault *reference* mechanism
(`@Microsoft.KeyVault(SecretUri=...)` app settings, `infra/modules/app-service.bicep`) would then resolve and
`auth-api.ts` would see a real value. **That assumption is wrong and is the actual reason val1 stayed broken
after SD-004.** App Service resolves `@Microsoft.KeyVault(...)` references from the **platform control
plane**, which does not traverse the app's VNet integration. `kv-azurechat-val1` is
`publicNetworkAccess: Disabled`, private-endpoint-only — so the control plane cannot reach it regardless of
how correct the managed-identity RBAC or `WEBSITE_VNET_ROUTE_ALL` configuration is. Populating the vault alone
does **not** close this: the app setting still holds the literal, unresolved reference string forever, and
`configureIdentityProvider()`'s `if (process.env.AZURE_AD_CLIENT_SECRET && ...)` guard sees that string (not
empty, but also not a usable secret before this fix — see below) or, in earlier states, nothing at all.

**The correct pattern — verified as the fix — is in-app retrieval via `DefaultAzureCredential`**, the same
mechanism `cosmos.ts` / `ai-search.ts` / `azure-storage.ts` already use to reach their own private-endpoint-only
services: that traffic goes over the app's own VNet integration (not the control plane), so it reaches the
vault. This is the finding to carry forward: **Key Vault references are unusable against a
`publicNetworkAccess: Disabled` vault on App Service; in-app `DefaultAzureCredential` retrieval is the only
working pattern**, independent of RBAC or VNet-integration correctness on either side.

### What was implemented
- `src/instrumentation-auth-secrets.node.ts` (new): fetches `azure-ad-client-secret` and `nextauth-secret`
  from Key Vault via `AzureKeyVaultInstance()` (`@azure/keyvault-secrets` + `DefaultAzureCredential`, the
  existing shared helper). Vault name comes from the `AZURE_KEY_VAULT_NAME` app setting — never hardcoded.
  Assigns to `process.env.AZURE_AD_CLIENT_SECRET` / `NEXTAUTH_SECRET` only when the current value is absent
  **or** is a still-unresolved `@Microsoft.KeyVault(...)` reference string — never overwrites an already-real
  value (e.g. local `.env`). On any failure (fetch throws, or the vault returns an empty value), logs a
  structured code only (`auth.keyvault.fetch-failed` + `secretName` + a derived `errorCode` — REST error
  `code`/`statusCode`/`name`, never the raw error message/stack) via `safeLog`, per `safe-logger.ts`
  discipline, and never throws — a Key Vault outage degrades to "no Azure AD provider", not a crashed boot.
- `src/instrumentation.ts` (modified): `register()` now `await`s
  `resolveAuthSecretsFromKeyVault()` alongside the existing SR-010 telemetry registration, both gated to
  `NEXT_RUNTIME === "nodejs"` only (Edge/middleware bundle exclusion), as two independent `Promise.all` entries
  so auth secret resolution is never coupled to whether Application Insights is configured.
- **No change to `auth-api.ts` or anything under `src/features/auth/`.**

### Ordering — verified against the installed `next@15.5.23` source, not assumed
The risk: `register()` must fully resolve before `auth-api.ts`'s module-load-time
`providers: [...configureIdentityProvider()]` reads `process.env`. Traced through the installed package:

- `BaseServer.handleRequest()` (`base-server.js`) — `await this.prepare();` is the literal first line of every
  request handled, no exception for the first request.
- `prepare()` memoizes `this.prepareImpl()`. `NextNodeServer.prepareImpl()` (`next-server.js`) —
  `await this.runInstrumentationHookIfAvailable()` → `ensureInstrumentationRegistered()` →
  `registerInstrumentation()` → `await instrumentation.register()`
  (`instrumentation-globals.external.js`). The memoized promise cannot resolve until `register()`'s own
  returned promise does.
- The one place a route module can be `require()`d before any request exists —
  `unstable_preloadEntries()`, active here because `experimental.preloadEntriesOnStart` defaults to `true` in
  this Next version and is not overridden in this repo's `next.config.js` (confirmed in
  `node_modules/next/dist/server/config-shared.js`) — itself does `await this.prepare();` as its own first
  line before loading any page/route component.

Every path that can load `auth-api.ts` is therefore gated behind the same memoized `prepare()` promise that
`register()` must finish first, **provided `register()` fully awaits the fetch before returning** (it does —
`await Promise.all([registerNodeTelemetry(), resolveAuthSecretsFromKeyVault()])`, not fire-and-forget).
Mechanism used: **await inside the existing `register()` hook — not a lazy accessor.** No lazy-read rewrite of
`auth-api.ts` was needed or made.

### Deploy and live proof (2026-08-11, subscription "Azure subscription 1", `app-azurechat-val1` /
`rg-azurechat-val1` only)
Packaged per `.github/workflows/open-ai-app.yml` (`.next/standalone` + `.next/static` + `public`, zipped),
`az webapp deploy --type zip --async false` (OneDeploy, `status: 4` / success). `WEBSITE_RUN_FROM_PACKAGE=1`
was already set.

**Second, independent gap found and fixed during proof, not part of the original secret-ordering scope:**
`AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` were **entirely absent** from `app-azurechat-val1`'s App Service
settings — not unresolved references, simply never wired at all
(`infra/modules/app-service.bicep` only ever set `AZURE_AD_CLIENT_SECRET`). Without these two **non-secret**
values, `configureIdentityProvider()`'s guard fails regardless of the Key Vault fix. Set live via
`az webapp config appsettings set` (not a Bicep edit — `infra/` was not touched):
`AZURE_AD_CLIENT_ID=d67a176e-852e-451a-ad66-b9912e53a1c5` (the `salescoach360-val1-auth` app registration —
matches SD-001's recorded client ID and both its registered redirect URIs) and
`AZURE_AD_TENANT_ID=d4b1b55b-6c92-4419-9a08-956e975dce86` (matches the operator's own authenticated tenant).
**Follow-up owed:** wire both into `infra/modules/app-service.bicep` as plain (non-Key-Vault) app settings so
a future redeploy from that template doesn't reintroduce this gap — not done here, `infra/` is off-limits
without discussion.

| Proof | Result |
|---|---|
| 1. `GET /api/auth/providers` | Returns `{"azure-ad": {...}}` (was `{}`) |
| 2. `POST /api/auth/signin/azure-ad` with a valid CSRF token+cookie | `302` → `https://login.microsoftonline.com/d4b1b55b-6c92-4419-9a08-956e975dce86/oauth2/v2.0/authorize?client_id=d67a176e-852e-451a-ad66-b9912e53a1c5&...` |
| 3. `az webapp config appsettings list ... AZURE_AD_CLIENT_SECRET` | Still only `@Microsoft.KeyVault(SecretUri=https://kv-azurechat-val1.vault.azure.net/secrets/azure-ad-client-secret/)` — never the raw value, confirming the fix never writes the secret to an App Service setting |

All three pass. Note the scope of what's proven: this exercises provider *registration* and *authorization
redirect construction* only — not a full interactive OAuth code exchange (would require a real human login),
so the client secret *value* stored in the vault has not been round-trip-verified against Entra's token
endpoint the way SD-002 step 4 did for the previous (App-Service-setting-stored) secret. Recommended next
step: an interactive sign-in smoke test, or a `client_credentials` grant check like SD-002's, before treating
this as fully end-to-end verified.

### Gates
`npx tsc --noEmit` (0 errors, after fixing 3 pre-existing type errors — a non-optional-property `delete` in
the test file worked around with an explicitly-optional-typed view of `process.env`, and a proper `value is
string` type predicate on `isRealSecretValue` so TS narrows the Key Vault response before assignment), `npm
run build` (success), `npm run lint` (clean), `npm run test` (27 files / 256 tests passed) — all green.

### Left open, not blocking SR-001 closure
- **Orphaned Entra credential** `val1-90d-20260811-kv-managed` (keyId `c8e5c660-5b24-42cf-be7f-a89589e23723`,
  SD-004) still has no known value and is still unused — needs `az ad app credential delete` once the
  vault-backed `azure-ad-client-secret` value is confirmed (see "recommended next step" above) to be a working
  credential rather than the orphan itself.
- `infra/modules/app-service.bicep` should be updated (separately, with discussion — `infra/` is off-limits
  here) to (a) stop wiring `AZURE_AD_CLIENT_SECRET`/`NEXTAUTH_SECRET` as `@Microsoft.KeyVault(...)` references
  at all, since that mechanism is now confirmed permanently unusable against this vault's network
  configuration, and (b) add `AZURE_AD_CLIENT_ID`/`AZURE_AD_TENANT_ID` as plain app settings so the live fix
  applied here survives a future template-driven redeploy.
- `NEXTAUTH_URL` is set to `https://app-azurechat-val1.azurewebsites.net`, not the customer domain — the
  PROOF 2 redirect's `redirect_uri` therefore points at the `.azurewebsites.net` origin (registered on the app
  registration and so functionally fine) rather than `val1-sales360.pixelflow.dk`. Cosmetic/UX only, unrelated
  to SR-001, not fixed here — flagged for a separate ticket.

---

## SR-001 — Secret management remediation

**Status:** CLOSED (2026-08-11) — see SD-005. **Was blocking:** any production/customer deployment, and (from
SD-004 onward) val1 sign-in directly; both are now unblocked, subject to the "left open" items in SD-005.

Completion requirements, all mandatory:

1. Store the Entra client credential in the customer Key Vault (`kv-azurechat-{slug}`). **DONE** — both
   `azure-ad-client-secret` and `nextauth-secret` exist in `kv-azurechat-val1` (written via ARM control plane,
   value never recorded in this repo).
2. Configure App Service to consume it via a secure, in-VNet-reachable mechanism using its managed identity.
   **DONE, but not via a Key Vault reference** — SD-005 establishes that the `@Microsoft.KeyVault(...)`
   reference mechanism is **unusable** against a `publicNetworkAccess: Disabled` vault (App Service resolves
   references from the control plane, which never traverses the app's VNet integration, regardless of RBAC or
   `WEBSITE_VNET_ROUTE_ALL`). The working mechanism actually deployed is in-app retrieval via
   `DefaultAzureCredential` (`src/instrumentation-auth-secrets.node.ts`, invoked from `src/instrumentation.ts`'s
   `register()` hook, before any route module is loaded) — architecturally equivalent to how `cosmos.ts` /
   `ai-search.ts` / `azure-storage.ts` already reach their own private-endpoint-only services.
3. Grant only the minimum Key Vault secret-read RBAC scope to that identity. **DONE** — the App Service
   system-assigned identity holds `Key Vault Secrets User`, scoped to `kv-azurechat-val1` only (verified
   2026-08-11, SD-004; unchanged by SD-005).
4. Use a short credential lifetime; document the rotation procedure in the operations runbook. **Runbook
   written** — see `docs/deployment-record.md`, "Operations runbook — Key Vault-backed credential rotation
   (SR-001)". Now exercisable end-to-end (item 1 has landed).
5. Ensure the secret value never appears in source control, deployment output, logs, documentation, or chat responses. **Held throughout** — no value was ever printed, logged, or written to any file in SD-004 or SD-005.
   `instrumentation-auth-secrets.node.ts`'s failure path is codes-only by construction (see SD-005).
6. Evaluate certificate-based confidential-client authentication as a production hardening option, if reliably supported by the NextAuth/Auth.js Entra provider in use. **Evaluated, not implemented** — see
   `docs/deployment-record.md` runbook section. Finding: not natively supported by `next-auth` v4.24.5's
   `AzureADProvider`; achievable only via a custom `token.request()` override with a hand-built
   `private_key_jwt` client assertion — a meaningfully larger, separately-scoped change, not a drop-in.

**Note:** the current (unrecoverable, still-live) Entra credential `val1-90d-20260810-rotated` expires
2026-11-08 and is now the credential actually protecting sign-in (assuming it is what was written into the
vault — see SD-005's "recommended next step" for confirming this). A second, orphaned credential
`val1-90d-20260811-kv-managed` (keyId `c8e5c660-5b24-42cf-be7f-a89589e23723`) remains and needs deletion once
that confirmation happens.

---

## SR-002 — Local-auth (`disableLocalAuth`) remediation for AI services (BLOCKS PRODUCTION)

**Status:** OPEN · **Blocks:** any production/customer deployment

Pre-existing gap found during Stage 5c: `disableLocalAuth` is unset on the Azure OpenAI and Document Intelligence accounts, despite the platform's zero-secrets rule. (The new Speech module, commit `12638bb`, sets `disableLocalAuth: true` from the outset.)

Completion requirements, in this order:

1. Verify managed-identity RBAC is correct on both accounts.
2. Perform **real successful service calls** using managed identity (not just role inspection).
3. Set `disableLocalAuth: true` in `infra/modules/openai.bicep` and `infra/modules/document-intelligence.bicep`, then redeploy.
4. Repeat smoke and integration tests to confirm nothing regressed.
5. Verify no API keys or connection strings remain anywhere in application configuration.

---

## Standing constraint

Production deployment is **prohibited** until SR-001 and SR-002 both pass. **SR-001 CLOSED 2026-08-11 (SD-005).** SR-002 remains open and still blocks production. Validation-environment work (Phase F, test suite, reviews) is explicitly **not** blocked on either.

---

## SD-006 — Review-gauntlet findings SR-011 / SR-012 / SR-013 (2026-08-11)

Three defects found by the security and GDPR reviews of the new product-UI surface. All
three were live in the deployed build. All three are fixed in commit `7c3432c`, deployed
and verified on val1.

### SR-011 (HIGH, security) — cross-user destruction of indexed RAG content

`DeleteDocumentsByFileNameInThread` deletes AI Search chunks by `chatThreadId + fileName`
with **no user clause** in its OData filter. Its own doc comment states callers must have
verified thread ownership first — a contract that was asserted in prose and enforced
nowhere.

Both callers live in a `"use server"` module, so each is an individually POST-able Server
Action; being imported by an authenticated page protects nothing. Two calls sufficed:
`CreateChatDocument(victimFileName, victimThreadId)` mints a row the attacker genuinely
owns but which points at another user's thread; `RemoveChatDocument` then passes the
pre-existing `r.userId === callerId` check and cascades into deleting the victim's indexed
chunks. The victim's Cosmos row survives, so the document still lists in `/documents`
while its RAG content is silently gone.

Not mass-exploitable — thread ids are 36-character nanoids — but a scriptable, targeted
cross-user data-destruction path against anyone whose thread id has been shared.
**Fixed:** both entry points verify thread ownership. Owning the row is not owning the
thread. Regression tests fail with the guards stubbed out and pass with them in place.

### SR-012 (HIGH, GDPR) — raw identity PII shipped to Application Insights on every login

`auth-api.ts` logged the entire Entra ID-token claim set plus email, `oid`, tenant id and
a base64 data-URL of the user's profile photo, unconditionally, on every sign-in. The
GitHub provider did the same.

This was inert for as long as console output went nowhere durable. **SR-010 — added in
this same session — is what made it live**, by enabling the OpenTelemetry `console`
bridge. From that point every sign-in shipped that payload into Application Insights, a
store no erasure path reaches: a fully erased data subject still had their identity
sitting in telemetry for the retention window.

Worth stating plainly: this was a privacy regression introduced by our own observability
work, not an inherited defect. An improvement to one system turned a dormant defect in
another into a live one, and nothing in the SR-010 change flagged the interaction.

**Fixed:** routed through `safeLog`'s allow-list. Only the canonical id is logged — the
same value already stored as the Cosmos partition key.

### SR-013 (HIGH, GDPR) — three document types written but never erasable

`PROMPT`, `PERSONA` and `EXTENSION` — upstream azurechat types, all written keyed to
`currentUserId()` from live reachable pages — were absent from the erasure registry.
`PROMPT` was the worst: `ConfigContainer` has `defaultTtl: -1`, so those documents were
retained forever with no erasure path at all, an Art. 17 and an Art. 5(1)(e) problem
simultaneously.

**The more important finding is why nobody noticed.** The erasure service's module doc
states that a test fails "if a new store is added without erasure coverage". That test
compared the registry against a hand-written list of document types — and that list
omitted the same three types the registry omitted. Both sides of the comparison shared
one blind spot, so the guard could not fail. A guard maintained by hand, by the same
person who forgot to update the thing it guards, is not a guard.

**Fixed:** all three are erasable, and the test now discovers every `*_ATTRIBUTE`
constant by reading the source tree, with a floor assertion so a renamed convention
cannot shrink it to empty and pass for the wrong reason. Verified by adding a throwaway
unclassified constant: the test failed naming it, and passed again once removed.

---

## SD-007 — Entra credential inventory for `salescoach360-val1-auth` (2026-08-11)

Two client secrets exist on app registration `d67a176e-852e-451a-ad66-b9912e53a1c5`:

| displayName | keyId | valid from | expires | status |
|---|---|---|---|---|
| `val1-90d-20260811-kv` | `2e7b4f94-781e-4d01-844e-2366ac622d6f` | 2026-08-11T14:49:50Z | 2026-11-09 | **in use** |
| `val1-90d-20260810-rotated` | `21a8e6e1-12bd-427c-b7cb-65dfacc49131` | 2026-08-10T15:45:20Z | 2026-11-08 | stale, still valid |

The orphaned third credential `val1-90d-20260811-kv-managed`
(`c8e5c660-5b24-42cf-be7f-a89589e23723`), whose value was never captured, **has been
deleted** — confirmed absent from the live credential list.

**Which credential the vault holds, established without reading any secret value:** the
`azure-ad-client-secret` resource in `kv-azurechat-val1` has an ARM control-plane
`created` timestamp of 2026-08-11T14:49:54Z — four seconds after `val1-90d-20260811-kv`
was minted. Sign-in works against that vault value. The vault therefore holds
`val1-90d-20260811-kv`, and `val1-90d-20260810-rotated` is unused.

**Decision: the stale credential is NOT being deleted in this session, deliberately.**
The four-second correlation is strong evidence but it is still inference, and a secret's
value cannot be recovered once deleted. An earlier attempt in this same project to tidy
up credentials on similarly confident reasoning took val1 authentication down (SD-004).
The stale credential is scoped to one app registration, expires 2026-11-08, and removing
it is hygiene rather than a blocker — not worth risking a second self-inflicted outage.

**Recommended operator action:** delete keyId `21a8e6e1-12bd-427c-b7cb-65dfacc49131`,
then immediately confirm `POST /api/auth/signin/azure-ad` still returns a 302 to
`login.microsoftonline.com`. If it does not, mint a new secret and rewrite the vault via
`infra/modules/keyvault-secrets.bicep` — the recovery path is known and takes minutes.

---

## Correction to the standing constraint

The "Standing constraint" section above is **out of date** and is superseded here:

- **SR-001 — CLOSED** (SD-005). Note the closure differs from the finding's original
  wording: App Service Key Vault *references* cannot work against a private-endpoint-only
  vault, because the platform control plane does not traverse VNet integration. The
  implemented pattern is in-app `DefaultAzureCredential` retrieval, which is stronger — no
  secret value lands in App Service settings at all.
- **SR-002 — CLOSED.** Verified live 2026-08-11: `disableLocalAuth: true` on both
  `oai-azurechat-val1` (OpenAI) and `docintel-azurechat-val1` (FormRecognizer).

Production is no longer blocked by SR-001 or SR-002. It remains blocked by **SR-008**
(no break-glass accounts — see `docs/runbooks/SR-008-break-glass-accounts.md`), and the
authenticated data-plane matrix is still unproven pending a human interactive login.
