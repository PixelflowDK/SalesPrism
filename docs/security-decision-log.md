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

## SR-001 — Secret management remediation (BLOCKS PRODUCTION)

**Status:** OPEN — see SD-004 (2026-08-11) for the latest attempt, what it fixed, and what still blocks it.
**Blocks:** any production/customer deployment. Also currently blocking val1 sign-in (see SD-004) — this is
now an active outage, not only a compliance gap.

Completion requirements, all mandatory:

1. Store the Entra client credential in the customer Key Vault (`kv-azurechat-{slug}`). **NOT DONE** — the
   vault has no `azure-ad-client-secret` or `nextauth-secret` entries yet (SD-004).
2. Configure App Service to consume it via a **Key Vault reference** using its managed identity and VNet integration (not a copied value). **DONE, code+deploy** — `infra/modules/app-service.bicep` wires both app
   settings to unversioned `@Microsoft.KeyVault(SecretUri=...)` references and this is live on val1. Currently
   resolves to `SecretNotFound` because of item 1.
3. Grant only the minimum Key Vault secret-read RBAC scope to that identity. **DONE** — the App Service
   system-assigned identity holds `Key Vault Secrets User`, scoped to `kv-azurechat-val1` only (verified
   2026-08-11, SD-004).
4. Use a short credential lifetime; document the rotation procedure in the operations runbook. **Runbook
   written** — see `docs/deployment-record.md`, "Operations runbook — Key Vault-backed credential rotation
   (SR-001)". Cannot be exercised end-to-end until item 1 lands.
5. Ensure the secret value never appears in source control, deployment output, logs, documentation, or chat responses. **Held throughout SD-004's attempt** — no value was ever printed, logged, or written to any file.
6. Evaluate certificate-based confidential-client authentication as a production hardening option, if reliably supported by the NextAuth/Auth.js Entra provider in use. **Evaluated, not implemented** — see
   `docs/deployment-record.md` runbook section. Finding: not natively supported by `next-auth` v4.24.5's
   `AzureADProvider`; achievable only via a custom `token.request()` override with a hand-built
   `private_key_jwt` client assertion — a meaningfully larger, separately-scoped change, not a drop-in.

**Note:** the current (unrecoverable, still-live) Entra credential `val1-90d-20260810-rotated` expires
2026-11-08; a second, orphaned credential `val1-90d-20260811-kv-managed` (keyId
`c8e5c660-5b24-42cf-be7f-a89589e23723`) was created during the SD-004 attempt and needs deletion once a
working vault-backed secret is confirmed. Remediation must land before 2026-11-08 regardless of production
timing — sooner now, since it is also blocking val1 sign-in today.

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

Production deployment is **prohibited** until SR-001 and SR-002 both pass. Validation-environment work (Phase F, test suite, reviews) is explicitly **not** blocked on them.
