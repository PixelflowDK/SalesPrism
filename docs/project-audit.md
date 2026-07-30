# Project Audit — Verified State vs. Documented Claims

**Date:** 2026-07-30
**Purpose:** Establish a single verified baseline after discovering multiple false/unverified claims in `docs/Sales_Prism_SAD_v2.7.md`. This document is the source of truth for "what is actually true right now" — the SAD and CLAUDE.md have been corrected to point here and to `docs/architecture-decisions/ADR-001-model-baseline.md`.

---

## 1. Verified Environment (2026-07-30)

| Item | Verified value |
|---|---|
| Node.js | 22.23.2 |
| Azure Developer CLI (azd) | 1.29.0 |
| Azure CLI (az) | 2.84.0 |
| Azure resource providers | Registered (Microsoft.CognitiveServices, Microsoft.Search, Microsoft.DocumentDB, Microsoft.Web, Microsoft.Network, Microsoft.KeyVault) |
| GitHub CLI (gh) | Authenticated with `workflow` scope |
| Codex CLI | 0.146.0 |
| Cloudflare API token (`CF_DNS_TOKEN`) | Verified zone-scoped to `pixelflow.dk` only |

---

## 2. Claim-vs-Reality Table

| Claim | Source | Reality | Status |
|---|---|---|---|
| SP-A02 "alle 12 DoD-punkter grønne" | SAD v2.7 decisions log | Packages upgraded (Next 15, AI SDK v6) but the chat route had 1 TypeScript error at time of writing — fixed in Stage 2b. Claim was not verified before being recorded. | ⚠️ Partially true |
| SP-B01 "15/15 DoD-punkter grønne" | SAD v2.7 decisions log | `infra/modules/` Bicep modules exist (commit 4aeef12) but were not independently verified — no lint/what-if run confirmed the claim at time of writing. Verification is scheduled for Stage 3a. | ⚠️ Unverified |
| `sales-prism.com` registered / platform domain | SAD v2.7 (multiple sections), old CLAUDE.md | Domain was **never registered**. Platform runs on `{customerSlug}-sales360.pixelflow.dk`, an existing Cloudflare zone. | ❌ False |
| "GitHub organisation PixelflowDK" | SAD v2.7 decisions log, old CLAUDE.md | `PixelflowDK` is a **personal GitHub account**, not an organization. | ❌ False |
| "Fable 5 suspenderet 12. juni 2026 af US Commerce Department" | SAD v2.7 decisions log | Fable 5 was **never suspended**. This entry was hallucinated. Corrected in the SAD and in CLAUDE.md — Fable 5 is the lead/orchestrator model. | ❌ False (hallucinated) |
| `graphify-out/` knowledge graph exists | Old CLAUDE.md | Directory is **absent** from the repository. | ❌ Absent |
| `.github/workflows/provision-customer.yml` exists | SAD v2.7 Phase B | File does **not exist yet** — scheduled for Stage 3c. | ❌ Absent |
| GPT-4.x model family available for new deployments | SAD v2.7 §13, decisions log | GPT-4.x family is **Deprecated** on Azure OpenAI and blocked for new subscriptions. Re-baselined to gpt-5.4-mini / gpt-5.4 / gpt-5.5 per ADR-001. | ❌ False (deprecated) |

---

## 3. Canonical Document Hierarchy

When documents conflict, resolve in this order (highest precedence first):

1. **`docs/architecture-decisions/*.md` (ADRs)** — override the SAD wherever they conflict. ADR-001 re-baselines all AI model references.
2. **SAD v2.7 Decisions Log (§20)** — supersedes the SAD body text and §11 color palette where they conflict with each other.
3. **SAD v2.7 body (`docs/Sales_Prism_SAD_v2.7.md`, §1–19, §21+)** — canonical architecture narrative, corrected in place 2026-07-30.
4. **`docs/Sales_Coach_360_Feature_Backlog.md`** — product feature scope (V1/V2/V3).
5. **`docs/Frontend_Teknologi_Reference.md`** — frontend stack reference detail.

**Superseded/duplicate:** The Google Drive copy of "SAD v1.7" is superseded by the checked-in `docs/Sales_Prism_SAD_v2.7.md` and must not be treated as current. Any Drive-hosted copy is a duplicate for historical reference only.

---

## 4. Scope Statement

- **In scope:** Phases A–F of the SAD build sequence (§18), covering Foundation, Automated Provisioning, UI/Theming/Service Migration, Admin Portal, Sales Coach 360 Core Features (F-01–F-04), and PWA/Model Routing/Onboarding.
- **Out of scope (current sprint):** Phase G (Version 2 features F-05–F-07) and Phase H (Version 3 features F-08–F-09). These remain backlog items only — no implementation work should target them until Phases A–F exit criteria are met.
- **Feature scope:** Version 1 (MVP) = F-01 (Structured Meeting Prep), F-02 (Real-time Conversation Coaching), F-03 (Persistent Customer Intelligence), F-04 (Persona Mapping). V2/V3 features are explicitly excluded from current work.

### Addendum 2026-07-30 (post-audit cleanup)
Orphaned upstream azurechat templates deleted (dead code, zero-secrets violation): `infra/resources.bicep` (contained AZURE_OPENAI_API_KEY app setting), `infra/private_endpoints_core.bicep`, `infra/private_endpoints_services.bicep`, `infra/main.parameters.json`. None were referenced by the active `infra/main.bicep` module chain. Recoverable via git history.
