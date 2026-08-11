# Session handoff — Coach 360 autonomous completion

**Updated:** 2026-08-11 · **Branch:** develop · **HEAD:** f6bce2d
**Live:** https://val1-sales360.pixelflow.dk · **Deployed revision:** a9eead3 (2026-08-10T22:11Z)

> **COMMITTED ≠ DEPLOYED ≠ VERIFIED.** Track all three separately. This project has been
> burned by conflating them twice (SR-009, and 18 commits sitting undeployed for 11 days).

## Verified working right now

- Authentication end-to-end. A real Entra session resolves to canonical identity
  `d4b1b55b-6c92-4419-9a08-956e975dce86:7d37f13b-d198-4421-81c6-f0f9076049c7`,
  `isAdmin: true` derived from `oid` (not email). `/` correctly redirects to `/chat`.
  `/admin`, `/admin/users`, `/customers`, `/briefs`, `/chat` all 200 authenticated.
- Session shape is ADR-003 correct: `oid` + `tenantId` carry identity; `email` display-only.
- Cosmos schema exists and is gated (`infra/scripts/verify-cosmos-schema.sh`, exit 0).
- 240 unit tests; three-state Playwright sign-in suite passes (run with `--workers=1`;
  parallel runs are flaky in this sandbox, an environment artifact, not an app defect).

## Three auth defects fixed this session (all live)

1. `dc9eb8e` — service worker cached `GET /api/auth/csrf` for 24h → stale CSRF token → sign-in spun forever. Now ALL same-origin `/api/*` is NetworkOnly.
2. `01183cd` — `oid`/`tid` were read from `profile`, but next-auth's azure-ad provider sources `profile` from the **userinfo endpoint**, which carries neither. `idToken: true` makes `profile` the verified ID-token claims.
3. `a9eead3` — `redirectIfAuthenticated()` called `RedirectToPage()` **without await**; Next's `redirect()` throws `NEXT_REDIRECT`, which was swallowed as a floating rejection, so an authenticated user was shown the login page. **We introduced this in Stage 2b.**

## Authoritative remaining work

### Stream A — product UI layer (agent running)
W1 `/home` dashboard · W2 `/prepare` (F-01) · W3 `/coach` (F-02) · W4 `/modules` (7 models) ·
W5 stakeholder vs `/persona` naming collision · W6 document surface · W7 nav IA ·
W8 profile/sign-out. Spec: `docs/feature-to-ui-audit.md`.
**Why:** F-01 and F-02 — the two highest-differentiation V1 features — currently have NO
navigation entry point. Backend exists; the product does not expose it.

### Stream B — SR-001 + SR-010 (agent running)
Key Vault reference for the Entra credential; real App Insights telemetry proven end-to-end.

### Stream C — not yet started
- **SR-006** `enableZeroDataRetention` is dead code (declared in main.bicep, never passed to the openai module). SAD §6.5/§16.3 sell ZDR as an Enterprise add-on. Either wire it or remove it and correct the SAD — do not ship a parameter implying a control it does not deliver.
- **SR-007** Cosmos runs Periodic backup (4h/8h) not the Continuous30Days the SAD decided; blob soft-delete/versioning disabled; the 90-day lifecycle policy is committed but undeployed. SAD §22.3's RTO/RPO table is wrong.
- **SR-008** Only ONE tenant admin exists and it is MSA-federated `#EXT#`. Needs ≥2 cloud-only break-glass accounts on the onmicrosoft.com domain.
- **H-2** No `ipSecurityRestrictions`; val1 runs an unproxied managed cert — the exact config SAD §7.2 forbids, so §7.3's DDoS claim is false.
- **H-3** SAD §16.2's "hard guardrail" Azure Policy does not exist; only `@allowed` decorators.
- **H-5** None of §31.2's 7 alert rules exist (and they'd have no telemetry until SR-010 closes).
- **Task #30** Wire `verify-cosmos-schema.sh` into `provision-customer.yml` as a hard gate, plus a deployment-revision/drift gate.
- **Authenticated data-plane matrix** — chat/customer/brief/stakeholder/activity CRUD, document RAG ownership, logout-relogin ownership stability, cross-user and cross-tenant isolation, GDPR erasure against real data, canonical id under the expected Cosmos partition property.
- **Full review gauntlet** then the canonical acceptance matrix.

## Hard constraints (never relax)

Subscription "Azure subscription 1" only · only `*-sales360.pixelflow.dk` DNS records, never
touch pre-existing pixelflow.dk records · DataZoneStandard only, never GlobalStandard ·
ownership is `${tenantId}:${oid}`, never email · never print secret values (use
`--query "[].name"`) · no production deploy while any blocker is open · every Azure change:
inspect → what-if → deploy → post-state diff, checking disableLocalAuth,
publicNetworkAccess, identities, RBAC, private endpoints, backup, Cosmos failover,
AI Search semanticSearch, tags, region.

## Fresh-session launch prompt

> Continue the autonomous completion of Coach 360 from repository state. Read, in order:
> `docs/session-handoff-current.md`, `docs/feature-to-ui-audit.md`,
> `docs/known-limitations.md`, `docs/security-decision-log.md`,
> `docs/architecture-decisions/`, and `.claude/session-state.json`. Verify git HEAD and the
> deployed val1 revision before trusting any completion claim — committed is not deployed and
> deployed is not verified. Then execute the "Authoritative remaining work" section to
> completion: finish the product UI layer so every V1 capability is discoverable, close every
> open production blocker with IMPLEMENT → TEST → DEPLOY → VERIFY LIVE → COMMIT → CLOSE WITH
> EVIDENCE, complete the authenticated data-plane matrix, run the full review gauntlet, and
> produce the canonical acceptance matrix. Work autonomously; only stop for a genuine human
> blocker (interactive credentials, MFA, a purchase, an irreversible business decision, or
> usage exhaustion). Do not deploy production while any blocker remains open.
