# Resume Instructions — Sales Coach 360 One-Shot Execution

**Updated:** 2026-07-30 ~19:15 · **Branch:** develop · **Last stable commit:** `5763ce8`
**Lead model:** Fable 5 → handing to **Opus** (cost decision; Fable credits reserved for genuinely cross-cutting problems). Sonnet workers unchanged, Haiku for trivia.

## Hard constraints (from the authorized launch prompt — never violate)
- Subscription **"Azure subscription 1" only**. EU regions only (Cosmos may use `swedencentral` per ADR-002).
- Cloudflare: only `*-sales360.pixelflow.dk` records; never modify/delete pre-existing `pixelflow.dk` records; never expose `CF_DNS_TOKEN`.
- Azure OpenAI **DataZoneStandard only**; no API keys anywhere; `USE_MANAGED_IDENTITIES=true`.
- No production/customer deployment until validation gates pass. No repo-visibility change. No force-push.
- Destructive `az` commands and `az role assignment create` are classifier-blocked in auto mode → hand the exact command to the user.
- Cost mode: delegate all bounded work to Sonnet; lead stays lean.

## Verified state
- Stages 0–4 and 5a **complete and pushed** (task board #1–#11).
- Validation infra deployed and independently verified **8/8** (`docs/deployment-record.md`): DataZoneStandard chat+embedding models, 6 private endpoints with bound DNS zone groups, MI data-plane roles, Node 22, no secrets.
- DNS + TLS live: **https://val1-sales360.pixelflow.dk** (App Service managed cert; unproxied until an Origin CA key exists).
- Codex review #1: all 7 findings fixed (F1–F4, F6 in infra/ci; F5, F7 in src) — `docs/reviews/`.

## In flight at handoff (notifications may be lost if the session restarts)
- **Phase E worker** (task #12): F-01..F-04 + shared components in `src/features/sales-coach/`. Recover via `git status`; gates (`cd src && npx tsc --noEmit && npm run build && npm run lint`) must pass before commit.
- **App-deploy worker**: worktree build @`f05d994`, Entra app `salescoach360-val1-auth`, app settings + zip deploy to `app-azurechat-val1`. Recover by curling the val1 URL and reading the tail of `docs/deployment-record.md`; clean up `/tmp/salesprism-deploy` worktree if orphaned.

## Next actions, in order
1. Integrate Phase E output → gates → commit/push.
2. Confirm app deploy → login page live on the val1 URL → record → commit.
3. Redeploy the app including Phase E code (same zip pattern).
4. **Stage 5c / task #13 — Phase F:** PWA (`@ducanh2912/next-pwa`, network-only for `/api/chat`), 2-step model routing per ADR-001 (gpt-5.4-mini as classifier until gpt-5-nano quota lands), onboarding + help panel. Also still open: **Azure Speech STT proxy** (backlog F-02) — the Speech resource is NOT in Bicep yet; add a module + private endpoint or defer with a known-limitation entry.
5. **Stage 6 / task #14:** vitest unit tests (tenant resolver, filter construction, persona classification, theme validation, retention), Playwright E2E against the live validation URL (login needs a human or test account — coordinate with the user), axe accessibility, visual diff vs DESIGN.md/Stitch.
6. **Stage 7 / task #15:** security-reviewer + gdpr-data-handling, azure-compliance + azure-cost skills, second Codex review (`codex exec -s read-only`, output to `docs/reviews/`), pre-merge-reviewer, repair loops until no CRITICAL/HIGH remains.
7. **Stage 8 / task #16:** runbook updates (add Models-API lifecycle check to the monthly quota task), complete `docs/requirements-traceability.md`, final report per OneShotPlan §24, then PR develop→main.

## Open user actions / limitations (`docs/known-limitations.md`)
- Quota requests pending: gpt-5.4, gpt-5.5, gpt-5-nano, text-embedding-3-large (westeurope, DataZoneStandard) — blocks Professional/Enterprise tiers.
- Optional: Cosmos region-access request (aka.ms/cosmosdbquota) to retire the ADR-002 swedencentral fallback.
- Entra External ID CIAM tenant not created → dual-auth Method B deferred; Method A (Entra SSO) active.
- Origin CA key absent → Cloudflare proxied Full-strict TLS pending.
- Validation auth secrets live in App Service settings (customer Key Vault is private-endpoint-only) — production needs a VNet-side write path.

## Where to look
- `.claude/session-state.json` · `docs/project-audit.md` · `docs/deployment-record.md` · `docs/known-limitations.md` · `docs/architecture-decisions/ADR-001`, `ADR-002` · `docs/reviews/` · `DESIGN.md`
- Resume command: `claude --continue` in `/Users/hugosson/workspace/SalesPrism`
