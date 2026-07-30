# Resume Notes

**Last updated:** 2026-07-30
**Branch:** develop (last stable commit `5759fce`)
**Phase:** Stage 1-2 (audit/config/baseline)

## What's done

- ADR-001 (model baseline) written: re-baselines all AI models to gpt-5.4-mini / gpt-5.4 / gpt-5.5, DataZoneStandard, westeurope. Embeddings: text-embedding-3-small now, text-embedding-3-large when quota granted.
- CLAUDE.md and AGENTS.md corrected to reflect verified facts (domain, GitHub account type, model baseline, design system, current state).
- `docs/Sales_Prism_SAD_v2.7.md` corrected in place: domain, GitHub account, AI model architecture, SP-A02 status caveat, Fable 5 suspension claim removed, model-table and color-palette deprecation notices added.
- `docs/project-audit.md` created — verified environment + claim-vs-reality table + document hierarchy + scope statement.
- `docs/requirements-traceability.md` created — traceability matrix skeleton (all items "Not started" except environment verification).

## What's next

- Commit the Stage 1-2 baseline (docs + config corrections).
- Move to Stage 3: validation deployment — lint/what-if the SP-B01 Bicep modules (currently unverified), then build `provision-customer.yml` (Stage 3c, does not exist yet).

## Hard constraints (never violate)

- Subscription: **"Azure subscription 1" only** — never deploy to any other subscription.
- DNS: only `*-sales360.pixelflow.dk` records may be created or updated. Pre-existing `pixelflow.dk` records are untouchable.
- Azure OpenAI: **DataZoneStandard only** — never GlobalStandard.
- **No production deployment before validation gates pass** (Stage 3a lint/what-if, security-reviewer sign-off).
- **Never expose `CF_DNS_TOKEN`** — it is zone-scoped to `pixelflow.dk`; treat as a secret, never print, log, or commit it.
- No API keys anywhere — `USE_MANAGED_IDENTITIES=true` always; `AZURE_OPENAI_API_KEY` must never be set.

## Where to look

- Full session state: `.claude/session-state.json`
- Governing docs: `docs/Sales_Prism_SAD_v2.7.md`, `docs/architecture-decisions/ADR-001-model-baseline.md`, `docs/project-audit.md`, `docs/requirements-traceability.md`
