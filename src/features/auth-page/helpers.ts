import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { RedirectToPage } from "../common/navigation-helpers";
import { options } from "./auth-api";

export const userSession = async (): Promise<UserModel | null> => {
  const session = await getServerSession(options);
  if (session && session.user) {
    const oid = session.user.oid;
    const tenantId = session.user.tenantId;
    return {
      name: session.user.name!,
      image: session.user.image!,
      email: session.user.email!,
      isAdmin: session.user.isAdmin!,
      oid,
      tenantId,
      // ADR-003 — computed eagerly whenever both verified claims are present
      // so every consumer of `getCurrentUser()`/`userSession()` gets it "for
      // free", but left `undefined` (never a fallback value) when they
      // aren't — display-only consumers (main-menu, admin layout, ...) must
      // keep working even for a hypothetical session that never resolved an
      // `oid`/`tid`. Ownership-sensitive call sites use `canonicalUserId()`
      // / `currentUserId()` below, which THROW in that case instead of
      // silently reading `undefined`.
      canonicalUserId: oid && tenantId ? buildCanonicalUserId(tenantId, oid) : undefined,
    };
  }

  return null;
};

export const getCurrentUser = async (): Promise<UserModel> => {
  const user = await userSession();
  if (user) {
    return user;
  }
  throw new Error("User not found");
};

/**
 * ADR-003 — pure, session-independent builder so it is directly
 * unit-testable (see helpers.test.ts) without mocking `next-auth`.
 *
 * FAILS CLOSED: throws if either the Entra `tid` (tenant id) or `oid`
 * (object id) claim is missing, rather than falling back to any mutable
 * claim (`email`, `preferred_username`, `mail`, `upn`). An identity this app
 * cannot verify must never be treated as "this user" for data-ownership
 * purposes — see the ADR's val1 investigation: an MSA-federated `#EXT#`
 * account with `mail: None` was the case that made the old
 * `hashValue(email fallback chain)` scheme unsafe.
 *
 * Both GUIDs are lowercased so `TenantId:Oid` and `tenantid:oid` (case
 * differences some IdP responses/logs use) collapse to the identical
 * canonical string — see ADR-003's stated format.
 */
export const buildCanonicalUserId = (
  tenantId: string | undefined | null,
  oid: string | undefined | null
): string => {
  if (!tenantId || !oid) {
    throw new Error(
      "ADR-003 fail-closed: session is missing the verified oid/tid claim — refusing to derive an application identity from a mutable fallback (email/preferred_username/mail/upn)."
    );
  }
  return `${tenantId.toLowerCase()}:${oid.toLowerCase()}`;
};

/**
 * ADR-003 canonical application principal for the CURRENT authenticated
 * request: `${tenantId}:${oid}` from the verified Entra token, never a
 * fallback to email. Throws (fail closed) if there is no session, or if the
 * session lacks a verified `oid`/`tid` claim.
 */
export const canonicalUserId = async (): Promise<string> => {
  const user = await getCurrentUser(); // throws "User not found" if there is no session at all
  return buildCanonicalUserId(user.tenantId, user.oid);
};

/**
 * Renamed from the pre-ADR-003 `userHashedId()` (which returned
 * `hashValue(email)`) — every ownership-sensitive call site across
 * chat/sales-coach/persona/prompt/extension/admin services uses this name.
 * Identical value to `canonicalUserId()` above; kept as a distinct exported
 * name because "current user id" reads correctly at every one of those call
 * sites, while `canonicalUserId()` is the name the ADR itself uses.
 */
export const currentUserId = canonicalUserId;

/**
 * Generic SHA-256 helper. NOT used for application identity/ownership since
 * ADR-003 (see `canonicalUserId()` above) — the only remaining legitimate
 * caller is the local-dev `CredentialsProvider` in `auth-api.ts`, which has
 * no real Entra token to source an `oid`/`tid` from and therefore
 * synthesizes a stable-per-username dev-only id. Exported in case a future
 * caller genuinely needs a one-way hash of a non-identity value.
 */
export const hashValue = (value: string): string => {
  const hash = createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
};

export const redirectIfAuthenticated = async () => {
  const user = await userSession();
  if (user) {
    // MUST be awaited. `RedirectToPage` is async (Next.js 15 requires every
    // export of a "use server" module to be async) and Next's `redirect()`
    // works by THROWING `NEXT_REDIRECT`. Un-awaited, that throw lands in a
    // floating promise, is swallowed as an unhandled rejection, and this
    // function returns normally — so `app/page.tsx` carries on and renders the
    // login page to a user who is already signed in. That was the val1 defect:
    // Entra authentication succeeded, the session cookie was set, and the user
    // was still shown the login screen. Never call a redirect helper without
    // awaiting it.
    await RedirectToPage("chat");
  }
};

export type UserModel = {
  name: string;
  image: string;
  email: string;
  isAdmin: boolean;
  /** Entra v2 ID token `oid` claim — the immutable directory object id (ADR-003). Undefined for providers that don't supply it (dev credentials; GitHub, which is not part of the approved val1 architecture — see auth-api.ts). */
  oid?: string;
  /** Entra v2 ID token `tid` claim — the directory tenant id; `oid` is only unique within a tenant (ADR-003). */
  tenantId?: string;
  /** ADR-003 canonical application principal — `${tenantId}:${oid}`, lowercased. Undefined whenever `oid`/`tenantId` are unavailable; NEVER derived from email/preferred_username/mail/upn. Prefer `canonicalUserId()`/`currentUserId()` over reading this field directly when ownership matters — they fail closed instead of silently returning `undefined`. */
  canonicalUserId?: string;
};
