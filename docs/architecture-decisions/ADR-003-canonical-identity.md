# ADR-003: Canonical application identity = `${tenantId}:${oid}`

**Status:** Accepted · **Date:** 2026-08-10 · **Directed by:** Kristjan Hugosson
**Supersedes:** the email-derived `userHashedId()` ownership scheme inherited from azurechat

## Context

Ownership of every user-scoped record derived from `hashValue(user.email)` — a SHA-256 of the
email claim. Investigation of the val1 tenant (see the Entra investigation, 2026-08-10) showed
why that is unsafe:

- The sole administrator is an **MSA-federated `#EXT#` Member**: UPN
  `admin_insightcast.dk#EXT#@admininsightcast.onmicrosoft.com`, `mail: None`,
  `proxyAddresses: []`, real address only in `otherMails`.
- With `mail` null, identity falls back through `profile.email || profile.preferred_username`.
  **The claim that supplies ownership can therefore change between logins** — and because the
  hash is the Cosmos partition key and the RAG authorization filter value, a changed claim
  silently orphans a user from their own chat history, customers and briefs.
- Email is mutable by definition. An address change would have the same effect.

## Decision

**Canonical application principal = `${tenantId}:${oid}`**, from the verified Entra token.

- `oid` — the immutable directory object id. Never changes for the life of the object.
- `tenantId` prefix — keeps identifiers unambiguous if multi-tenant auth is introduced later,
  since `oid` is only unique within a tenant.
- Format: lowercase GUIDs joined by a colon, e.g.
  `d4b1b55b-6c92-4419-9a08-956e975dce86:7d37f13b-d198-4421-81c6-f0f9076049c7`.

**Never used for ownership:** `email`, `preferred_username`, `mail`, `upn`.
Those are retained **only** as mutable display/contact attributes.

Applies to: chat history (threads, messages, documents, citations), customer entities, meeting
briefs, stakeholder/persona data, document ownership, activity ownership, RAG authorization
filters, per-seller isolation, and GDPR erasure targeting.

**Admin authorization** likewise moves from `ADMIN_EMAIL_ADDRESS` string comparison to
`ADMIN_OBJECT_IDS` — a list of `oid` values checked against the **verified token claim**, never
a client-supplied value.

## Why migrate now rather than preserve compatibility

val1 is a validation environment and **the interactive login has never been performed**
(`docs/reviews/val1-login-flow-verification.md` Part B is still pending), so effectively no
user-owned documents exist. Migrating now costs a code change; migrating after real customer
data exists would cost a data migration on live tenants with a re-index of every AI Search
document. This is the cheapest moment this decision will ever have.

## Consequences

- Token must carry `oid` and `tid`. Both are standard claims on Entra v2 ID tokens; the
  NextAuth JWT callback must persist them into the session.
- If a token ever lacks `oid`, the request must **fail closed** — no fallback to email. An
  identity we cannot verify must not receive access to anyone's data.
- Field names change from `*HashedId` to `*Id` so the name stops implying a hash.
- Any pre-existing val1 documents keyed by the old hash become unreachable. Accepted: they are
  synthetic validation artifacts, and preserving them would mean keeping the broken scheme alive.
- Emergency access: the tenant currently has exactly one administrator identity, MSA-federated.
  Tracked separately as SR-008 — production requires break-glass accounts.
