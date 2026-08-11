# SR-008 — Emergency access (break-glass) accounts

**Status:** OPEN — blocks production. Requires an operator; cannot be automated by this project.
**Owner:** Kristjan Hugosson (tenant Global Administrator)
**Tenant:** `d4b1b55b-6c92-4419-9a08-956e975dce86` — "Default Directory", country `DK`
**Initial / default domain:** `admininsightcast.onmicrosoft.com`

---

## Why this is not done for you

Creating a user account and setting its password are actions this project's
automation is not permitted to perform, and correctly so: a break-glass
credential whose value has ever passed through a tool, a log, a shell history
or a CI runner is not a break-glass credential. It must be created by a human,
in the portal, and the password must go straight into physical escrow without
being typed anywhere else.

Everything below is therefore an operator procedure. The verification commands
at the end are safe to run and are the acceptance test.

---

## Verified current state (2026-08-11, read-only Graph queries)

| Fact | Value | Assessment |
|---|---|---|
| Total users in tenant | **1** | Single point of failure |
| Global Administrators | **1** | Single point of failure |
| The sole GA | `admin_insightcast.dk#EXT#@admininsightcast.onmicrosoft.com`, objectId `7d37f13b-d198-4421-81c6-f0f9076049c7` | **External-sourced identity** (`#EXT#`) |
| Cloud-only accounts on the initial domain | **0** | None exist |
| Conditional Access policies | **0** | None configured |

### What the `#EXT#` in that UPN means, and why it matters here

The only administrator of this tenant is not a native cloud account. It is an
identity whose UPN was minted from an external address (`admin@insightcast.dk`)
and stamped into this directory. Its `userType` is `Member`, so it holds full
administrative rights — but its authentication story is entangled with an
identity outside this directory.

The consequence is concrete: **there is currently no way to sign in to this
tenant that does not depend on that one external identity.** If it is deleted,
disabled, loses its MFA registration, or its source becomes unreachable, the
tenant — and therefore every customer's Entra app registration, every RBAC
grant, and every Key Vault access policy that depends on it — is unrecoverable
without a Microsoft support escalation.

### The zero Conditional Access policies are a trap, not a reprieve

Right now there is no CA policy to lock anyone out with, so the risk reads as
theoretical. It stops being theoretical the moment production hardening adds
the MFA and device policies a B2B SaaS is expected to have. The standard and
repeatedly-observed failure is: an administrator enables an MFA-for-all-admins
policy, the policy applies to every account including the only one that can
edit policies, something goes wrong with that account's second factor, and the
tenant is locked. Break-glass accounts must exist **before** the first CA
policy is created, not after.

---

## Procedure

### 1. Create two accounts

Two, not one — so that a single compromised or fumbled account does not exhaust
the recovery path. Create them in the Entra portal (Users → New user → Create
new user):

| | Account A | Account B |
|---|---|---|
| UPN | `breakglass-a@admininsightcast.onmicrosoft.com` | `breakglass-b@admininsightcast.onmicrosoft.com` |
| Display name | `Emergency Access A (BREAK-GLASS — DO NOT USE)` | `Emergency Access B (BREAK-GLASS — DO NOT USE)` |

Both **must** be on the `.onmicrosoft.com` initial domain. A custom domain can
have its DNS lapse, be transferred, or fail verification; the initial domain
cannot be removed from the tenant and so cannot break.

Both **must** be cloud-only. Do not invite them, do not federate them, do not
sync them. The whole point is an authentication path with no external
dependency — which is precisely what the current sole administrator lacks.

### 2. Passwords

Generate ≥ 32 random characters per account. Do not reuse. Do not store in a
password manager that is itself protected by this tenant's SSO — that is a
circular dependency that fails exactly when you need it.

Print each password, seal it in a separate tamper-evident envelope, and store
the two envelopes in **two different physical locations**. Record the seal
serial numbers in the security decision log.

Do not enter these passwords into any chat, terminal, CI system, or file.

### 3. Assign Global Administrator

Assign the **Global Administrator** role permanently and directly to both
accounts — not via a group, and not as an eligible PIM assignment. A PIM
activation flow can itself require MFA or approval, which reintroduces the
dependency this exists to remove.

### 4. Exclude from every Conditional Access policy

There are zero policies today. The rule to carry forward: **every** CA policy
created from now on must exclude both accounts.

Excluding break-glass accounts from MFA is a deliberate, documented trade-off,
not an oversight. It is compensated by (a) very long random passwords in
physical escrow, (b) two-person access, and (c) the sign-in alerting in step 5,
which turns any use into an immediate incident.

### 5. Alert on any sign-in

Create an alert rule that fires on **any** successful or failed sign-in by
either account. These accounts should be used approximately never, so any
authentication is either a real emergency or a compromise — both warrant
waking someone.

Suggested KQL, once sign-in logs are routed to `law-azurechat-*`:

```kusto
SigninLogs
| where UserPrincipalName startswith "breakglass-"
| project TimeGenerated, UserPrincipalName, ResultType, ResultDescription, IPAddress, AppDisplayName
```

Route it to a channel that does **not** depend on this tenant for delivery.

### 6. Quarterly validation

Escrowed credentials rot silently: passwords expire, MFA defaults change, roles
get cleaned up. Once per quarter, open one envelope, sign in, confirm Global
Administrator still applies, reset the password, and re-seal into a fresh
envelope. Alternate accounts each quarter. Record each drill in
`docs/security-decision-log.md`.

An untested break-glass account is not a break-glass account.

---

## Acceptance test

SR-008 may be closed only when all four commands below return the expected
result. These are read-only and safe to re-run at any time.

```bash
az rest --method GET --url "https://graph.microsoft.com/v1.0/users?\$filter=startswith(userPrincipalName,'breakglass-')&\$select=userPrincipalName,userType,accountEnabled,onPremisesSyncEnabled" -o json
```
Expect **2** users, each `userType=Member`, `accountEnabled=true`,
`onPremisesSyncEnabled=null`, both on `@admininsightcast.onmicrosoft.com`.

```bash
az rest --method GET --url "https://graph.microsoft.com/v1.0/directoryRoles/dc6ebc77-f9da-444f-8888-e4e69009c25b/members?\$select=userPrincipalName" -o json
```
Expect both break-glass UPNs present, alongside the existing administrator —
i.e. **3** Global Administrators total, no longer 1.

```bash
az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -o json
```
For every policy returned, both break-glass object ids must appear in
`conditions.users.excludeUsers`. While the list is empty this passes trivially;
re-run it after creating the first policy, and treat that re-run as part of
creating the policy.

```bash
az rest --method GET --url "https://graph.microsoft.com/v1.0/users?\$select=userPrincipalName,userType" -o json
```
Confirms the tenant is no longer a single-account tenant.

---

## Related

- `docs/security-decision-log.md` — SD-001 (app registration accepted), SD-003
  (secret exposure + rotation), SD-005 (SR-001 closure)
- `docs/architecture-decisions/ADR-003-canonical-identity.md` — why tenant
  identity correctness is load-bearing for the whole platform
