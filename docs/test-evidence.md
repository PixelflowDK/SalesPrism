# Test Evidence

**Purpose:** Record actual test runs (what was run, when, result, and where the raw output lives) as evidence against `docs/requirements-traceability.md`. Do not record a test as passed without linking real output.

| Date | Test | Scope | Result | Evidence location |
|---|---|---|---|---|
| 2026-07-30 | Documentation audit (manual review) | Verified environment claims (Node, azd, az, gh, codex-cli, CF_DNS_TOKEN scope) per `docs/project-audit.md` §1 | Pass — recorded as verified facts | `docs/project-audit.md` |

## Stage 6a — unit + isolation suite (2026-07-30)
- Framework: vitest, colocated `*.test.ts`. `npm run test` in `src/`.
- **9 files, 108 tests, all passing.**
- Coverage of tested modules: tenant-resolver 84%, safe-logger 95%, customer-entity-service 52%, context-injection 43%, chat-thread-service 24%. Overall repo coverage is low by design — UI/Cosmos/Search layers are covered by E2E, not unit tests.
- `server-only` shim: aliased to its own `empty.js` in vitest.config.ts (the branch Next.js selects server-side) — without it every server service throws on import under vitest.

### Two real bugs found by the suite (tests written first, left red, then fixed)
1. **OData injection in `buildDocumentSearchFilter`** (RAG authorization boundary). Values were interpolated raw; a single quote broke out of the string literal and could widen the AND into an OR. Not exploitable at the time (both inputs server-controlled: SHA-256 hash + Cosmos-fetched thread id) but a latent cross-user leak for any future caller. **Fixed** by OData quote-doubling; two regression tests assert injected values stay inside their literal and cannot forge a second syntactic clause.
2. **Forgeable evidence envelope in `wrapAsDocumentEvidence`** (Codex finding #5 mitigation was system-prompt-only). A chunk containing a literal `</document-evidence>` closed the untrusted-data boundary early, making subsequent injected text read as trusted. **Fixed** with `neutralizeEvidenceDelimiters` — both opening and closing forms are neutralized, so the envelope is non-forgeable while the chunk stays citable.

### Design observation
`EnsureChatThreadOperation`'s ownership branch is currently unreachable via its only caller (`FindChatThreadForCurrentUser` already filters on the caller's hashed id, so a non-owner gets NOT_FOUND first). The isolation test exercises the branch directly via a Cosmos mock — kept as defence in depth in case an admin-bypass query path is added later.

### Not covered (with reason)
- `group-service.ts` rename/delete: logic inlined in async I/O, no pure helper to test without restructuring.

## Stage 6b — Playwright E2E + accessibility (2026-07-30, live run vs https://val1-sales360.pixelflow.dk)
Suite: `src/e2e/` — access control, auth providers, PWA, accessibility, skipped authenticated journeys.
Result: 4 passed / 5 failed / 4 skipped. Every failure was a REAL finding, not a scaffold defect.

### Findings
1. **AUTHORIZATION GAP (fixed)** — `src/middleware.ts`'s `matcher` omitted `/customers`, `/briefs`, `/persona`, `/prompt`, so middleware never ran for them; `/customers` and `/briefs` were additionally absent from `requireAuth`. An anonymous request reached server code that throws on the missing session → 500 instead of a login redirect. **Fixed**: both lists corrected and kept in sync, with a comment binding them together; `/api/chat` and `/api/sales-coach/*` matcher patterns also tightened.
2. **ACCESSIBILITY (open, tracked)** — 3 serious WCAG AA contrast violations on the login page: Copper Fjord `#B86A4B` and Warm Stone `#807571` on white measure 4.03–4.46:1 against the required 4.5:1. DESIGN.md §7.3 already warned these are large-text-only colors; the login page uses them for body-size text. Tracked as SR-004.
3. **STALE DEPLOYMENT (expected)** — `/manifest.json` and `/sw.js` 404 on the live site because val1 still runs the pre-Phase-F build. Resolves on redeploy.

### Skipped (4) — visible gaps, not silent ones
All authenticated journeys (chat send, /customers, /briefs, admin gate) are `test.skip` with TODOs naming the exact blocker: a scripted Entra test user or a test-only credentials provider. Cannot be automated without a real credential decision.
