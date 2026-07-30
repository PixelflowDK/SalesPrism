# ADR-001: AI Model Baseline Re-established (July 2026)

**Status:** Accepted
**Date:** 2026-07-30
**Supersedes:** SAD v2.7 §13 (Component 9: AI Model Architecture) model/tier table
**Decision authority:** Autonomous execution session (Fable 5 lead), authorized launch prompt 2026-07-30

## Context

SAD v2.7 specifies model tiers Standard = GPT-4.1 mini, Professional = GPT-4.1, Enterprise = GPT-4o. Verified against Microsoft's official [model retirement schedule](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule) (docs updated 2026-07-24):

- The **entire GPT-4.x family is Deprecated** — new deployments are blocked for subscriptions that never deployed them. Our subscription ("Azure subscription 1") never has, so we are a *new customer* and **cannot deploy any GPT-4.x model**.
- gpt-4o (2024-05-13) retires 2026-10-01; gpt-4.1/-mini retire 2027-04-14 — but deprecation already blocks us regardless of dates.
- Anthropic models on Azure AI Foundry remain **Preview-only** (claude-sonnet-4-6, claude-opus-4-x, all Preview with near-term retirement dates). Preview models carry no DPA coverage and are not production-eligible. SAD v2.7's GDPR exclusion of third-party models **stands**.
- `text-embedding-3-large` / `-small` are GA until **2028-02-09** — safe.
- Phi-4 family is GA (partner/community catalog) but has no DataZoneStandard serverless offering in our regions — excluded for the same R2 reasons as other non-Azure-OpenAI models unless deployed on managed compute (cost-prohibitive for MVP).
- Microsoft now ships a GA **model-router** (2025-11-18, retire 2027-05-20, DataZoneStandard in westeurope) — this postdates the SAD's "no Azure-native model router" claim.

### Subscription-verified availability (Models API + quota, 2026-07-30)

DataZoneStandard (EUR) availability **and** non-zero quota on our subscription:

| Model | northeurope | westeurope | swedencentral | Our DZS quota (westeurope) |
|---|---|---|---|---|
| gpt-5.4 | DZS offered | DZS offered | DZS offered | **0 — quota request required** |
| gpt-5.4-mini | — (GS only) | **DZS offered** | DZS offered | **1,000K TPM available now** |
| gpt-5.5 | DZS offered | DZS offered | DZS offered | 0 — quota request required |
| gpt-5-nano | — | DZS offered | DZS offered | 0 — quota request required |
| gpt-5.1 | — (GPM only) | — (no DZS) | DZS offered | n/a in westeurope |
| model-router (GA 2025-11-18) | DZS offered | DZS offered | DZS offered | not requested |
| text-embedding-3-large | — (GS only) | DZS offered | DZS offered | **0 — quota request required** |
| text-embedding-3-small | — | DZS offered | — | **1,000K TPM available now** |

## Decision

1. **Deployment region: `westeurope`** for all AI resources. It is the only SAD-approved region (R1: northeurope/westeurope) with DataZoneStandard coverage for the full model set. Non-AI resources may use either approved region; default westeurope for co-location.
2. **Model tiers (replacing SAD §13.1):**

| Tier | Model | Deployment type | Status |
|---|---|---|---|
| Standard | **gpt-5.4-mini** (2026-03-17, GA→2027-03-18) | DataZoneStandard | **Deployable now** |
| Professional | **gpt-5.4** (2026-03-05, GA→2027-03-05) | DataZoneStandard | Quota-gated |
| Enterprise | **gpt-5.5** (2026-04-24, GA→2027-04-23) | DataZoneStandard | Quota-gated |

3. **Routing classifier + STT-cleanup model:** `gpt-5.4-mini` now (shared with Standard tier); migrate to `gpt-5-nano` when quota is granted (cheaper, sufficient for classification/cleanup). Bicep/config parameterized so this is a config change.
4. **Custom 2-step routing retained** per SAD Phase F (tier-scoped control, per-tenant logging). Microsoft `model-router` documented as a viable GA alternative; not adopted because it removes per-tier model pinning, which is a commercial contract surface (tier pricing).
5. **Embeddings:** target remains `text-embedding-3-large` (3072 dims) per SAD §19; **validation environment and any customer provisioned before large-quota grant uses `text-embedding-3-small` (1536 dims)**. Embedding model + dimension are Bicep/index parameters; each customer's AI Search index locks its dimension at provisioning (switching later requires reindex from Blob source — documented in runbook DR §22.2 which already covers rebuild-from-source).
6. **Azure Speech Service (STT)** is unaffected by OpenAI retirements — remains per SAD/backlog F-02, deployed in westeurope.
7. **DataZoneStandard only** for every Azure OpenAI deployment (unchanged, R2).
8. **Operator action required (non-blocking for validation):** submit quota requests in westeurope for `gpt-5.4` (1,000K TPM), `gpt-5.5` (500K), `gpt-5-nano` (500K), `text-embedding-3-large` (500K) via Portal → Azure OpenAI → Quotas (runbook §21.1 procedure; free, 2–5 business days).
9. **Retirement watch:** all chosen models have ≥7 months runway (earliest: gpt-5.4 on 2027-03-05). The runbook monthly quota check is extended with a lifecycle check via the Models API (`lifecycleStatus`, `deprecation.inference`).

## Consequences

- Validation environment deploys immediately on gpt-5.4-mini + text-embedding-3-small — no waiting on Microsoft.
- Professional/Enterprise tiers cannot onboard a paying customer until their quota grants land; recorded in known-limitations until closed.
- SAD §13, §18 Phase A/F model references, CLAUDE.md model table, and agent briefs must be updated to this baseline (tracked in the documentation-corrections task).
- Pricing tables in SAD §13.2/§17 must be re-estimated for GPT-5.x list prices before customer pricing commitments (cost model refresh task; margins expected to improve — GPT-5.x mini/nano list prices are at or below GPT-4.1-mini's).
