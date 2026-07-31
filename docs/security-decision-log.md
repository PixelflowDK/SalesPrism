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
| Client secret | `val1-90d-20260731`, expires **2026-10-29T23:59:59Z** (90 days — rotated, see SD-002) |

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

## SR-001 — Secret management remediation (BLOCKS PRODUCTION)

**Status:** OPEN · **Blocks:** any production/customer deployment

Completion requirements, all mandatory:

1. Store the Entra client credential in the customer Key Vault (`kv-azurechat-{slug}`).
2. Configure App Service to consume it via a **Key Vault reference** using its managed identity and VNet integration (not a copied value).
3. Grant only the minimum Key Vault secret-read RBAC scope to that identity.
4. Use a short credential lifetime; document the rotation procedure in the operations runbook.
5. Ensure the secret value never appears in source control, deployment output, logs, documentation, or chat responses.
6. Evaluate certificate-based confidential-client authentication as a production hardening option, if reliably supported by the NextAuth/Auth.js Entra provider in use.

**Note:** the current secret expires 2027-07-30; remediation must land well before then regardless of production timing.

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
