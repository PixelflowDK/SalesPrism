# Reassessment of the middleware CSRF self-heal (commit `86cfb95`)

**Date:** 2026-08-10 · **Trigger:** operator request after the true root cause (`dc9eb8e`, service-worker caching of `/api/auth/csrf`) was identified.
**Question:** is the self-heal still necessary, harmless-but-redundant, or capable of masking genuine failures?

## What it does

Middleware intercepts `GET /api/auth/signin?csrf=true` — the URL NextAuth redirects to when CSRF validation fails — clears six NextAuth cookies (`next-auth.csrf-token`, `__Host-next-auth.csrf-token`, `next-auth.callback-url`, `__Secure-next-auth.callback-url`, `next-auth.session-token`, `__Secure-next-auth.session-token`) and redirects to `/`.

## Why it was written, and what was actually wrong

It was introduced when sign-in dead-ended after the SD-003 `NEXTAUTH_SECRET` rotation. The reasoning at the time: the rotation invalidated the HMAC on the browser's CSRF cookie, so validation failed permanently because nothing ever cleared it.

That reasoning was **incomplete**. The dominant cause was the service worker caching `GET /api/auth/csrf` for up to 24 hours (`dc9eb8e`): the *token* was stale, not necessarily the cookie. The self-heal was treating a symptom of a caching bug.

## Failure classes, and which fix covers each

| # | Failure class | Covered by NetworkOnly (`dc9eb8e`)? | Covered by self-heal (`86cfb95`)? |
|---|---|---|---|
| 1 | SW replays a cached CSRF **token** | **Yes — root cause removed** | Only as after-the-fact recovery |
| 2 | Cookie HMAC invalid after secret rotation | Partly: the fresh `/api/auth/csrf` response carries `Set-Cookie`, which overwrites the same-named cookie | Yes |
| 3 | Browser holds **both** prefixed and unprefixed csrf cookies | **No** — a `Set-Cookie` for one name cannot remove the other; NextAuth may keep reading the stale one | **Yes — this is its unique value** |
| 4 | Genuine forged/absent CSRF token (an actual attack) | n/a — request is correctly rejected either way | Rejection still happens; cookie clearing is inert |
| 5 | **Persistent misconfiguration** (e.g. `NEXTAUTH_URL` host/scheme mismatch so the cookie is never returned) | No | **No — and this is where it does harm** |

## The masking risk is real

Class 5 is the problem. With the self-heal in place, a permanently broken cookie configuration presents as: click → bounce to `/` → click → bounce to `/` … indefinitely, with **no error surfaced anywhere**. Without it, the user lands on NextAuth's `?csrf=true` page, which is at least a visible, greppable signal.

The self-heal converts *"clear evidence of broken configuration"* into *"silent retry loop"*. Given this project has already lost several rounds to exactly that failure shape — a silent bounce with nothing in the logs — that is not an acceptable trade in its current form.

For class 2 and 3 it self-corrects in a **single** retry (cookies cleared → next `/api/auth/csrf` issues a matching pair), so a *repeat* firing is by definition not the transient case it was designed for.

## Decision: RETAIN, but make it non-masking

Removing it outright would give up the only mitigation for class 3, which no other fix covers. Keeping it as-is preserves a mechanism that can hide class 5 indefinitely.

Retain, with one required change:

1. **Emit a diagnostic every time it fires** — a structured `auth.csrf.self-heal-fired` code (no cookie values, no tokens), so repeated firing is detectable rather than invisible.
2. **Do not attempt to suppress repeat firing in middleware** (no counters or marker cookies — that adds state to an auth path for little gain). Detection belongs in telemetry, not in more auth logic.
3. **Dependency:** the diagnostic is only useful once telemetry actually flows — **SR-010**. Until then this mitigation is retained on the explicit understanding that its failure mode is under-observed.

## What it does NOT do

It does not weaken NextAuth CSRF protection. The CSRF check itself is unchanged and still runs on every sign-in; the middleware acts only *after* NextAuth has already rejected a request, and only on cookies that are by definition unverifiable. An expired or unverifiable cookie carries no authority, so clearing it removes nothing an attacker could have used.

## Regression coverage required

Before this is considered settled:
- Normal authentication succeeds with the self-heal present (covered by the three-state Playwright suite).
- Stale-cookie recovery still works: a bogus csrf cookie yields cookie-clearing headers and a subsequent attempt succeeds.
- The diagnostic fires exactly once per failed validation.
