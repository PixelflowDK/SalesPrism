# Resume — Sales Prism

**Last updated:** 2026-08-12 · **Commit:** `8838c9f` · **Deployed & live-verified:** `8838c9f`
**Validation env:** https://val1-sales360.pixelflow.dk

---

## Read this first

Verification against anything other than the *running instance* has produced three
withdrawn claims in this project. The rule that came out of it:

> **COMMITTED ≠ DEPLOYED ≠ VERIFIED.**
> `/api/health` reports a build-time-inlined commit SHA. That is the only trustworthy
> answer to "what is actually running". Git state, a cached response, and a green test
> run are all answers to different questions.

---

## Where things stand

All authorized engineering work is complete, deployed and verified live. What is left is
four human actions, three of which are a single script each.

**2026-08-12 was the first ever authenticated session against val1**, done by reusing an
existing Entra session in the operator's Chrome. It converted most of Phase D/E from
UNPROVEN to verified, and immediately surfaced three defects that no unauthenticated test
could reach (SR-014). That is the single most useful thing to know: *the unauthenticated
surface had been exhaustively tested and was hiding real bugs behind the login.*

### Verified live on 2026-08-12 (authenticated, real user)

- Sign-in completes through Entra; canonical identity is correct — `oid` matches the
  tenant's Global Administrator object id exactly, `tenantId` correct (ADR-003).
- All 11 authenticated routes render: `/home /prepare /coach /customers /briefs /modules
  /documents /chat /persona /prompt /extensions`.
- Full product navigation is present and discoverable.
- **Zero failed requests** across ~100 real authenticated requests in App Insights.
- Admin gate fails **closed** (verified specifically, not assumed — see below).
- Cosmos schema gate 14/14 including the App Insights assertion.

### Fixed on 2026-08-12 (SR-014)

| | Finding | Why it hid |
|---|---|---|
| a | `unhandledRejection` — Next image optimizer writing to a read-only wwwroot (`WEBSITE_RUN_FROM_PACKAGE=1`) | Only fires on pages using `next/image`, all behind the login |
| b | `ADMIN_OBJECT_IDS` never set — no account could be admin | Fails **closed**; `/admin` returns HTTP 200 serving the "not authorized" page, so it looks like working authorization |
| c | H-3 enforcement flip would have denied writes across an unrelated production workload | Only visible once the audit-only assignment produced compliance data |

On (b): a 200 on `/admin` with `isAdmin` absent looks identical from the outside whether
the gate fails open or closed. It was checked directly — the body is the unauthorized
page, served via `NextResponse.rewrite`. Not a security hole.

---

## The four remaining human actions

Each was analysed and prepared; each is blocked only by the agent's execution policy on
resource mutation, or by something genuinely unautomatable.

### 1. Break-glass accounts (SR-008) — the only production blocker

```bash
./infra/scripts/create-break-glass-accounts.sh
```

Creates both accounts, assigns Global Administrator, runs the acceptance test. Shows the
two passwords **once** — seal each in its own envelope, in two locations.

*Why not automated:* the permission exists (the signed-in context is Global
Administrator — verified). The blocker is the password: a break-glass credential that has
passed through an agent transcript is no longer a credential you can bet the tenant on.
The script generates it locally from `openssl rand`.

*Why it matters:* the tenant has **one** user, which is also its **only** Global
Administrator, and it is an external-sourced (`#EXT#`) identity. There is no sign-in path
that does not depend on it. Do not create the first Conditional Access policy until this
is done.

### 2. Remaining Azure mutations

```bash
./infra/scripts/finish-acceptance.sh
```

Sets `ADMIN_OBJECT_IDS`, deploys the gpt-5.4 / gpt-5.5 tier models, pushes the corrected
H-3 tag policy, re-verifies health. Idempotent.

### 3. One interactive login for the Playwright suite

```bash
cd src && npm run e2e:auth
```

Then the command it prints. Uses a persistent browser profile, so this is one-time rather
than per-run. `e2e/auth-setup.ts` documents why no non-interactive alternative works.

### 4. H-3 enforcement flip — a real decision, not a rubber stamp

Deliberately left out of the script. Re-run the compliance scan after the corrected
definition lands, confirm the non-compliant list is empty, then flip. A subscription-wide
deny affects resources this project does not own. Exact command and rollback are at the
end of `finish-acceptance.sh`.

---

## Stale claims corrected on 2026-08-12

- **"Models are quota-gated"** — **false since at least today.** `az cognitiveservices
  usage list -l westeurope` shows gpt-5.4 limit 300, gpt-5.5 limit 333, gpt-5-nano 2000,
  text-embedding-3-large 1000, all at 0 usage. This was recorded on 2026-07-30 and never
  re-checked. Nothing is quota-blocked; the models simply were never deployed.
- **"SR-002 still blocks production"** — closed. `disableLocalAuth: true` verified live on
  both AI accounts.

---

## Entra credential state

`salescoach360-val1-auth` (`d67a176e-852e-451a-ad66-b9912e53a1c5`) holds two secrets:

| displayName | keyId | status |
|---|---|---|
| `val1-90d-20260811-kv` | `2e7b4f94-…` | **in use** — the value in Key Vault |
| `val1-90d-20260810-rotated` | `21a8e6e1-…` | stale, still valid, expires 2026-11-08 |

Established without reading any secret: the vault secret's ARM `created` equals its
`updated` (written exactly once, never overwritten) at 14:49:54Z — four seconds after
`val1-90d-20260811-kv` was minted, and 23 hours after the other. A real
authorization-code login succeeded through it today, which proves the stored value is a
valid credential.

**Still not deleted, deliberately.** The evidence is strong but remains inference, a
secret cannot be recovered once deleted, and an earlier tidy-up on comparable confidence
took val1 down (SD-004). Recovery if it is ever wrong: mint a new secret, write it via
`infra/modules/keyvault-secrets.bicep`, verify sign-in — minutes, and a proven path.

---

## Pointers

- `docs/acceptance-matrix.md` — per-requirement status and evidence
- `docs/runbooks/SR-008-break-glass-accounts.md` — full procedure and rationale
- `docs/security-decision-log.md` — SD-001…SD-008
- `docs/known-limitations.md` — accepted structural gaps
- `.claude/session-state.json` — machine-readable state
