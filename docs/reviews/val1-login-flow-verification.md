# val1 interactive sign-in verification — rotated credential (SD-002)

**Purpose:** verify the complete NextAuth authorization-code flow against the validation
environment using the rotated 90-day credential (`val1-90d-20260731`) **only**. The earlier
`client_credentials` token test (SD-002 step 4) proved the secret is valid; it did **not**
exercise the authorization-code login path.

**Environment:** https://val1-sales360.pixelflow.dk
**App registration:** `salescoach360-val1-auth` — `d67a176e-852e-451a-ad66-b9912e53a1c5`
**Credential in use:** `val1-90d-20260731`, expires 2026-10-29 (the superseded 1-year credential was deleted 2026-07-31)

---

## Part A — automated, VERIFIED 2026-07-31

The authorization-redirect leg was verified without credentials:

| Check | Result |
|---|---|
| `GET /api/auth/signin` | **200** |
| `POST /api/auth/signin/azure-ad` → redirect target host | `login.microsoftonline.com` **PASS** |
| Authorize path tenant | `/d4b1b55b-6c92-4419-9a08-956e975dce86/oauth2/v2.0/authorize` — correct tenant **PASS** |
| `client_id` | `d67a176e-852e-451a-ad66-b9912e53a1c5` — the new registration **PASS** |
| `redirect_uri` | `https://val1-sales360.pixelflow.dk/api/auth/callback/azure-ad` — custom domain, matches a registered URI **PASS** |
| `scope` | `openid profile User.Read` — exactly the approved minimum set, nothing added **PASS** |
| `response_type` | `code` — authorization-code flow **PASS** |

This proves the app builds a correct authorization request against the correct tenant and
registration. It does **not** prove token exchange, session creation, or logout.

---

## Part B — interactive legs: REQUIRES A HUMAN. NOT VERIFIED.

The remaining legs cannot be automated by the agent: they require entering real user
credentials at Microsoft's sign-in page. The agent does not hold credentials and does not
enter credentials into sign-in forms. **These legs are therefore UNVERIFIED and must not be
claimed as passing.**

### Procedure for the operator

Use a private/incognito window so no pre-existing session is reused (a cached session would
invalidate the test by skipping the credential exchange entirely).

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| B1 | Open https://val1-sales360.pixelflow.dk in a private window | Coach 360 login shell renders | ☐ | screenshot |
| B2 | Click sign-in → redirected to Microsoft | Entra sign-in page for tenant `d4b1b55b…` | ☐ | screenshot (URL bar visible) |
| B3 | Complete sign-in with a tenant account | Redirect back to `/api/auth/callback/azure-ad`, then into the app | ☐ | screenshot |
| B4 | Session created | Authenticated chat UI renders; no redirect back to login | ☐ | screenshot |
| B5 | Authenticated page access | `/customers` and `/briefs` load (not 302 to login, not 500) | ☐ | screenshot |
| B6 | Admin gate | Authorization is now by **Entra `oid`**, not email (ADR-003). `ADMIN_OBJECT_IDS=7d37f13b-d198-4421-81c6-f0f9076049c7` is set on val1 and `ADMIN_EMAIL_ADDRESS` has been removed. Signed in as that account, `/admin` loads; any other identity → `/unauthorized` | ☐ | screenshot |
| B6b | Ownership stability (ADR-003) | After B8's re-login, previously created data is still visible — proves ownership follows `oid`, not a mutable claim | ☐ | screenshot |
| B7 | Logout | Session cleared; protected routes redirect to login again | ☐ | screenshot |
| B8 | Re-login | Sign in a second time succeeds (proves the flow is repeatable, not a one-off cached grant) | ☐ | screenshot |

**Do not paste session cookies, tokens, authorization codes, or credentials into this file,
into chat, or into any commit.** Screenshots should show the page state and URL only — redact
any `code=`/`state=` query values if a callback URL is captured mid-flight.

### Recording the result
Tick the boxes above, note the date and the account used (email domain only, not the full
address if you prefer), and commit. If any step fails, record the exact failure and treat the
rotation as **not fully validated** until it is resolved.

---

## Status

- **Part A: VERIFIED** (automated, 2026-07-31).
- **Part B: PENDING OPERATOR.** Until Part B is complete, SD-002's rotation is validated only
  to the extent that the credential is cryptographically valid and the authorization request
  is correctly formed — the end-to-end login has **not** been demonstrated on the new
  credential.
- SR-001 remains OPEN and production-blocking regardless of Part B.
