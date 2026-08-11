# Feature-to-UI Audit — Coach 360 V1

**Date:** 2026-08-11 · **HEAD:** a9eead3 · **Live:** https://val1-sales360.pixelflow.dk (authenticated session verified)

**Standard applied:** a feature is complete only when backend + data model + authorization + frontend + a **discoverable navigation entry point** + working workflow + deployed + tested + persistent + isolated + acceptance criteria all hold. Backend-only is NOT complete.

## Live navigation, as actually rendered (read from the DOM of `/chat`)

```
Coach 360 · EXPERT WORKSPACE
Home | Chat history | Chat | Persona | Customers | Briefs | Extensions | Prompt Library | Reporting | Admin | Help
hrefs: /chat /persona /customers /briefs /extensions /prompt /reporting /admin/users
```

## Matrix

| Feature | Requirement | Backend | API/data | Route | Nav entry | Rendered UI | Live verified | Status |
|---|---|---|---|---|---|---|---|---|
| **F-01 Meeting Prep** | Backlog F-01 | YES (meeting-prep-tool, structured-output) | YES | via `/chat` only | **NONE** | brief renders inline in chat | partial | **INCOMPLETE — no entry point** |
| **F-02 Coaching** | Backlog F-02 | YES (intent-detection, context-injection) | YES | via `/chat` only | **NONE** | inline chat reply | partial | **INCOMPLETE — no entry point** |
| **F-03 Customer Intelligence** | Backlog F-03 | YES | YES | `/customers`, `/customers/[id]` | YES | YES | 200 authenticated | **NEEDS DATA-PLANE PROOF** |
| **F-04 Stakeholder/Persona** | Backlog F-04 | YES (persona-card) | YES | inside `/customers/[id]` | partial (`/persona` is azurechat personas, a DIFFERENT concept) | YES | not proven | **INCOMPLETE — naming collision + unproven** |
| **Briefs** | F-01 output | YES | YES | `/briefs`, `/briefs/[id]` | YES | YES | 200 | **NEEDS DATA-PLANE PROOF** |
| **Learning Modules (7 models)** | SAD §27 | registry only (`models.ts`, 7 entries) | partial (`ModuleConfig`) | **NONE** | **NONE** | **NONE** | n/a | **MISSING — no UI at all** |
| **Documents / RAG** | SAD §9 | YES | YES | inside chat only | **NONE** | file attach in chat | not proven | **INCOMPLETE — no management surface** |
| **Chat** | SAD §5 | YES | YES | `/chat`, `/chat/[id]` | YES | YES | 200 | **NEEDS DATA-PLANE PROOF** |
| **Admin (users/groups/analytics/settings)** | SAD §8.4–8.6 | YES | YES | `/admin/*` | YES | YES | 200, isAdmin true | **NEEDS DATA-PLANE PROOF** |
| **Onboarding** | SAD §18 Phase F | YES | YES | modal | auto on first login | YES | not proven | NEEDS PROOF |
| **Help panel** | SAD §18 Phase F | YES | n/a | slide-over | YES | YES | not proven | NEEDS PROOF |
| **Speech / STT** | Backlog F-02 | YES (proxy) | YES | mic in chat input | conditional | hidden — no Speech resource in val1 | n/a | **BLOCKED on infra** |
| **PWA / mobile** | SAD §18 Phase F | YES | n/a | manifest + sw | n/a | YES | manifest 200 | NEEDS VISUAL PROOF |
| **Model routing** | SAD §18 Phase F | YES | n/a | transparent | n/a | n/a | not proven | NEEDS PROOF |
| **Profile / logout** | implied | NextAuth | YES | — | **NOT VERIFIED in nav** | ? | ? | **CHECK** |

## Findings that block "product complete"

1. **F-01 and F-02 are invisible.** Both are the highest-differentiation V1 features (backlog: "Kritisk — højeste differentiering") and neither has a navigation entry. A seller cannot discover them without being told to type a magic phrase into chat. **This alone means Phase E is not product-complete.**
2. **Learning Modules do not exist as a product surface.** SAD §27 specifies 7 Sales Coach models per customer with admin toggles; only the in-code registry exists.
3. **`/persona` is a naming collision.** It is azurechat's system-prompt "Personas", not the backlog's stakeholder Personas (F-04). Two different concepts share a nav word — actively confusing.
4. **No Home/dashboard.** "Home" points at `/chat`. There is no landing surface orienting a new seller.
5. **No document management surface.** Upload exists only inside a chat thread; no way to see or manage what a customer knows.
6. **`/extensions`, `/prompt`, `/reporting`** are inherited azurechat surfaces, not in the Coach 360 V1 scope — they dilute the product and need a keep/hide decision.

## Required work (feeds the authoritative graph)

- **W1** Home/dashboard with clear entry points to Prepare, Coach, Customers, Briefs, Modules.
- **W2** `/prepare` — first-class Meeting Preparation surface (customer/topic pick → guided questions → brief → save).
- **W3** `/coach` — first-class Conversation Coaching surface (text + voice input, feedback, model references, history).
- **W4** `/modules` — the 7 Sales Coach models, per-tenant enable/disable in admin.
- **W5** Rename stakeholder UI to avoid the `/persona` collision; surface stakeholders coherently under customers.
- **W6** Document management surface tied to customers/threads.
- **W7** Nav IA rework: group by seller workflow, hide out-of-scope inherited pages.
- **W8** Profile/session/logout affordance.
