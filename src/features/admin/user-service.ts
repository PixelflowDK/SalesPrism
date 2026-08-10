import "server-only";

import { getCurrentUser, currentUserId } from "@/features/auth-page/helpers";
import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { uniqueId } from "@/features/common/util";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";

/**
 * Customer-admin user directory — SAD v2.7 §8.4.
 *
 * Container/schema decision: there is no dedicated "users" Cosmos
 * container — `src/features/common/services/cosmos.ts` only exposes
 * `HistoryContainer` (chat data, partitioned on the *end user's* hashed
 * id) and `ConfigContainer` (tenant-level config, partitioned on
 * *tenantSlug* — see `TenantTheme`, `PromptModel`, `PersonaModel`).
 *
 * `UserAccount` documents are tenant directory data, not per-user chat
 * data, so they follow the `ConfigContainer`/`TenantTheme` convention:
 * partition key value (`userId` field, per the container's fixed
 * `/userId` partition path) is set to `tenantSlug`, so "list all users for
 * my tenant" / "list all tag dimensions for my tenant" is always a single,
 * cheap, partition-scoped query — never a cross-partition scan — even
 * though each customer already has a fully isolated Cosmos account (SAD
 * §6.1) and in principle only ever holds one tenant's data.
 */
export const USER_ACCOUNT_ATTRIBUTE = "USER_ACCOUNT";

export const UserRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(["active", "disabled"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/**
 * Matches `TenantTheme.authMethod` (SAD §8.1/§8.2/§8.3). Per-tenant, not
 * per-user — every user of a given tenant shares the same auth method,
 * decided once at onboarding. Stored per-user here purely for display in
 * the admin users table without an extra TenantTheme lookup per row.
 */
export const UserAuthMethodSchema = z.enum(["entra-sso", "username-password"]);
export type UserAuthMethod = z.infer<typeof UserAuthMethodSchema>;

export const UserAccountSchema = z.object({
  id: z.string(),
  type: z.literal(USER_ACCOUNT_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, see module doc above. */
  userId: z.string(),
  tenantSlug: z.string(),
  /**
   * ADR-003 canonical application principal (`${tenantId}:${oid}`, from
   * `currentUserId()`/`canonicalUserId()`) — the same identity value used
   * throughout `chat-services/*`. This is how `EnsureUserOnLogin` finds "my
   * own" doc and how ownership checks cross-reference a chat-history
   * `userId` back to a directory entry. Never the raw email/name.
   *
   * NULLABLE: `CreateUser` (the `/admin/users` "invite by email" flow)
   * pre-provisions a directory entry BEFORE the invited person has ever
   * signed in — at that point their real `oid` is unknowable (it only
   * exists once Entra issues them a token). `null` here means "invited, not
   * yet linked to a real login." `EnsureUserOnLogin` adopts the first
   * matching-by-email pending invite it finds for this tenant and fills in
   * the real `canonicalUserId` on first sign-in (see
   * `findPendingInviteByEmail`). This email-match is a UX convenience for
   * inheriting admin-set role/tags, NOT a security/ownership decision —
   * every chat/customer/brief document is always owned by the freshly
   * computed, verified `canonicalUserId`, never influenced by this field's
   * prior null state.
   */
  canonicalUserId: z.string().nullable(),
  displayName: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  authMethod: UserAuthMethodSchema,
  tags: z.record(z.string(), z.string()),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  status: UserStatusSchema,
  /**
   * ISO timestamp of when this user completed (or skipped) the first-login
   * onboarding flow (Stage 5c, SAD §18 Phase F) — `null` until then.
   * `.default(null)` so existing Cosmos documents written before this field
   * existed still parse successfully (treated as "not yet onboarded",
   * which is the correct/safe interpretation for pre-existing users too —
   * worst case they see the skippable onboarding flow once more).
   */
  onboardingCompletedAt: z.string().nullable().default(null),
});
export type UserAccount = z.infer<typeof UserAccountSchema>;

/**
 * The document `id` is intentionally NOT derived from `canonicalUserId` —
 * unlike the pre-ADR-003 scheme (`user-${tenantSlug}-${hashValue(email)}`),
 * a canonical id can be `null` at document-creation time (`CreateUser`'s
 * pending-invite case, see `UserAccountSchema.canonicalUserId` doc above)
 * and is filled in later without ever needing to rename/recreate the
 * document. `id` only needs to be unique within the `tenantSlug` partition,
 * which `uniqueId()` already guarantees — same pattern as every other
 * `ConfigContainer` doc-id helper in this codebase (`customerEntityDocId`,
 * `meetingBriefDocId`, ...).
 */
const userAccountDocId = (tenantSlug: string) => `user-${tenantSlug}-${uniqueId()}`;

/** Below this age, `EnsureUserOnLogin` skips the `lastLoginAt` write entirely. */
const LOGIN_TIMESTAMP_THROTTLE_MS = 5 * 60 * 1000;

const parseUserAccount = (
  raw: unknown
): ServerActionResponse<UserAccount> => {
  const parsed = UserAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "ERROR",
      errors: zodErrorsToServerActionErrors(parsed.error.errors),
    };
  }
  return { status: "OK", response: parsed.data };
};

/** All users for a tenant — single partition-key query, see module doc above. */
export const FindUsersForTenant = async (
  tenantSlug: string
): Promise<ServerActionResponse<UserAccount[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug ORDER BY r.createdAt ASC",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (error) {
    safeLog.error("admin.users.list-failed", { tenantSlug });
    return {
      status: "ERROR",
      errors: [{ message: "Unable to load users for this tenant." }],
    };
  }
};

export const FindUserById = async (
  tenantSlug: string,
  id: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const { resource } = await ConfigContainer().item(id, tenantSlug).read<UserAccount>();
    if (!resource || resource.tenantSlug !== tenantSlug) {
      return { status: "NOT_FOUND", errors: [{ message: "User not found." }] };
    }
    return parseUserAccount(resource);
  } catch (error) {
    safeLog.error("admin.users.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
  }
};

const findByCanonicalUserId = async (
  tenantSlug: string,
  canonicalUserId: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.canonicalUserId=@canonicalUserId",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@canonicalUserId", value: canonicalUserId },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "User not found." }] };
    }
    return parseUserAccount(resources[0]);
  } catch (error) {
    safeLog.error("admin.users.lookup-by-hash-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
  }
};

/**
 * Any directory entry (pending invite OR already-linked-to-a-real-login)
 * matching `email`, case-insensitively, within this tenant. `CreateUser`'s
 * pre-ADR-003 duplicate-prevention relied on the doc `id` itself being
 * `hashValue(email)`-derived, so two invites for the same address collided
 * on the SAME Cosmos `id` and the second write 409'd. Now that `id` is a
 * random `uniqueId()` (decoupled from identity so a `null` canonicalUserId
 * doesn't block doc creation — see `userAccountDocId`'s doc comment), that
 * implicit dedup no longer happens for free, so `CreateUser` checks
 * explicitly instead.
 */
const findAnyAccountByEmail = async (
  tenantSlug: string,
  email: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND LOWER(r.email)=@email",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@email", value: email.trim().toLowerCase() },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "No account found." }] };
    }
    return parseUserAccount(resources[0]);
  } catch (error) {
    safeLog.error("admin.users.lookup-by-email-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
  }
};

/**
 * Finds an admin-pre-provisioned directory entry (`canonicalUserId IS
 * NULL`, `CreateUser`'s "invite by email" case) matching `email`,
 * case-insensitively, within this tenant. Used ONLY by
 * `EnsureUserOnLogin`'s first-login reconciliation (see
 * `UserAccountSchema.canonicalUserId` doc comment) — never for
 * authentication or data ownership. If more than one pending invite happens
 * to share an email (shouldn't normally occur — `CreateUser` doesn't
 * dedupe by email across admins, only Cosmos 409s on exact `id` collision),
 * the oldest (`createdAt ASC`, same tenant-list ordering as
 * `FindUsersForTenant`) is adopted and the rest remain pending.
 */
const findPendingInviteByEmail = async (
  tenantSlug: string,
  email: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND IS_NULL(r.canonicalUserId) AND LOWER(r.email)=@email ORDER BY r.createdAt ASC",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@email", value: email.trim().toLowerCase() },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<UserAccount>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "No pending invite found." }] };
    }
    return parseUserAccount(resources[0]);
  } catch (error) {
    safeLog.error("admin.users.lookup-pending-invite-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load user." }] };
  }
};

/**
 * Lazily upserts the current authenticated user's directory entry and
 * (throttled) `lastLoginAt` timestamp on first authenticated request.
 *
 * NextAuth's own callbacks (`src/features/auth-page/auth-api.ts`) are
 * off-limits (read-only per the Stage 5a brief), so this cannot hook the
 * actual sign-in event — it is instead called once per request from
 * `src/app/(authenticated)/layout.tsx`, which wraps every authenticated
 * route (chat, admin, persona, ...). To avoid a Cosmos write on every page
 * navigation, the `lastLoginAt` update itself is throttled to at most once
 * per `LOGIN_TIMESTAMP_THROTTLE_MS`.
 *
 * Best-effort: failures are logged (safeLog) and swallowed — a Cosmos
 * hiccup here must never block the user from using the product.
 */
export const EnsureUserOnLogin = async (): Promise<void> => {
  try {
    const user = await getCurrentUser();
    const canonicalUserId = await currentUserId();
    const tenantSlug = await getCurrentTenantSlug();
    const now = new Date().toISOString();

    const existing = await findByCanonicalUserId(tenantSlug, canonicalUserId);

    if (existing.status === "OK") {
      const doc = existing.response;
      const lastLoginAge = doc.lastLoginAt
        ? Date.now() - new Date(doc.lastLoginAt).getTime()
        : Number.POSITIVE_INFINITY;

      if (lastLoginAge < LOGIN_TIMESTAMP_THROTTLE_MS) {
        return;
      }

      await ConfigContainer().items.upsert<UserAccount>({
        ...doc,
        // Keep displayName/email in sync with the identity provider without
        // clobbering admin-managed fields (role, tags, status).
        displayName: user.name,
        email: user.email,
        lastLoginAt: now,
      });
      return;
    }

    if (existing.status !== "NOT_FOUND") {
      return; // transient read error already logged by findByCanonicalUserId
    }

    // ADR-003 reconciliation: no directory entry has this verified
    // canonicalUserId yet — check for an admin-pre-provisioned "invite by
    // email" entry (`canonicalUserId: null`, see `CreateUser`) before
    // seeding a brand-new one, so a `/admin/users`-invited seller's
    // admin-configured role/tags aren't silently orphaned the moment they
    // actually sign in. This match is by email only (a UX convenience, not
    // a security boundary — see the schema doc comment); the canonical id
    // written below is always the freshly verified one, never derived from
    // this match.
    const pendingInvite = await findPendingInviteByEmail(tenantSlug, user.email);
    if (pendingInvite.status === "OK") {
      await ConfigContainer().items.upsert<UserAccount>({
        ...pendingInvite.response,
        canonicalUserId,
        displayName: user.name,
        email: user.email,
        lastLoginAt: now,
      });
      return;
    }
    if (pendingInvite.status !== "NOT_FOUND") {
      return; // transient read error already logged by findPendingInviteByEmail
    }

    const tenantTheme = await GetTenantTheme(tenantSlug);
    const authMethod: UserAuthMethod =
      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";

    const seeded: UserAccount = {
      id: userAccountDocId(tenantSlug),
      type: USER_ACCOUNT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      canonicalUserId,
      displayName: user.name,
      email: user.email,
      // First-ever user for a tenant, or any oid covered by
      // ADMIN_OBJECT_IDS, seeds as admin so a fresh tenant is never
      // locked out of its own /admin section.
      role: user.isAdmin ? "admin" : "user",
      authMethod,
      tags: {},
      createdAt: now,
      lastLoginAt: now,
      status: "active",
      onboardingCompletedAt: null,
    };

    await ConfigContainer().items.create<UserAccount>(seeded);
  } catch (error) {
    // Cosmos raises 409 if a concurrent request already created/updated the
    // same doc first — not an error, just lost a race. Anything else: log
    // and swallow, never break the authenticated app shell over this.
    const code = (error as { code?: number })?.code;
    if (code !== 409) {
      safeLog.error("admin.users.ensure-on-login-failed");
    }
  }
};

/**
 * First-login onboarding status (Stage 5c, SAD §18 Phase F) for the
 * CURRENT authenticated user. Called once per authenticated page load
 * (see `(authenticated)/layout.tsx`, right after `EnsureUserOnLogin` — so
 * by the time this runs, the caller's own directory entry is guaranteed to
 * already exist), to decide whether to auto-open the onboarding modal.
 *
 * Fails OPEN to "already completed" on a lookup error — a Cosmos hiccup
 * must never re-surface the onboarding flow to an existing user who has
 * already seen/skipped it; the flow is also always reachable again from
 * the Help panel regardless of this result.
 */
export const GetOnboardingStatus = async (): Promise<{ completed: boolean }> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();
    const canonicalUserId = await currentUserId();
    const existing = await findByCanonicalUserId(tenantSlug, canonicalUserId);

    if (existing.status === "OK") {
      return { completed: Boolean(existing.response.onboardingCompletedAt) };
    }
    if (existing.status === "NOT_FOUND") {
      // Genuinely brand new user — should not happen post-`EnsureUserOnLogin`,
      // but if it does, show onboarding (the safe default for a new user).
      return { completed: false };
    }
    return { completed: true }; // transient read error — fail open, don't nag
  } catch {
    return { completed: true };
  }
};

/**
 * Marks onboarding complete (or explicitly skipped — both are "don't ask
 * again", per the Stage 5c brief's "skippable" requirement) for the current
 * authenticated user. Best-effort: a write failure here must never block
 * the user from closing/using the onboarding modal — the client always
 * treats it as dismissed regardless of whether this persisted.
 */
export const MarkOnboardingCompleted = async (): Promise<void> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();
    const canonicalUserId = await currentUserId();
    const existing = await findByCanonicalUserId(tenantSlug, canonicalUserId);
    if (existing.status !== "OK") return;

    await ConfigContainer().items.upsert<UserAccount>({
      ...existing.response,
      onboardingCompletedAt: new Date().toISOString(),
    });
  } catch {
    safeLog.error("admin.users.mark-onboarding-completed-failed");
  }
};

/**
 * Admin "invite by email" — pre-provisions a directory entry (role/tags/
 * displayName) for someone who has never signed in yet. Under ADR-003 their
 * real `canonicalUserId` (`${tenantId}:${oid}`) is only knowable once Entra
 * issues them a token, so this seeds `canonicalUserId: null`;
 * `EnsureUserOnLogin` links it to the real value on their first sign-in
 * (see `findPendingInviteByEmail` and the schema doc comment). Until then,
 * this entry owns no chat/customer/brief data (nothing could — those are
 * all keyed by a non-null canonicalUserId), so a GDPR erasure request for a
 * never-logged-in invitee is a no-op everywhere except this one directory
 * doc (`EraseDataSubject` already handles `canonicalUserId: null` — see
 * gdpr-erasure-service.ts).
 */
export const CreateUser = async (input: {
  displayName: string;
  email: string;
  role: UserRole;
  tags: Record<string, string>;
}): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();

    const duplicate = await findAnyAccountByEmail(tenantSlug, input.email);
    if (duplicate.status === "OK") {
      return {
        status: "ERROR",
        errors: [{ message: "A user with this email already exists." }],
      };
    }

    const tenantTheme = await GetTenantTheme(tenantSlug);
    const authMethod: UserAuthMethod =
      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";

    const now = new Date().toISOString();
    const model: UserAccount = {
      id: userAccountDocId(tenantSlug),
      type: USER_ACCOUNT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      canonicalUserId: null,
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      authMethod,
      tags: input.tags,
      createdAt: now,
      lastLoginAt: null,
      status: "active",
      onboardingCompletedAt: null,
    };

    const parsed = UserAccountSchema.safeParse(model);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }

    const { resource } = await ConfigContainer().items.create<UserAccount>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to create user." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    safeLog.error("admin.users.create-failed", { statusCode: code });
    if (code === 409) {
      return {
        status: "ERROR",
        errors: [{ message: "A user with this email already exists." }],
      };
    }
    return { status: "ERROR", errors: [{ message: "Unable to create user." }] };
  }
};

export const UpdateUser = async (
  tenantSlug: string,
  id: string,
  patch: Partial<Pick<UserAccount, "displayName" | "email" | "role" | "tags">>
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const existing = await FindUserById(tenantSlug, id);
    if (existing.status !== "OK") return existing;

    const updated: UserAccount = { ...existing.response, ...patch };
    const parsed = UserAccountSchema.safeParse(updated);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }

    const { resource } = await ConfigContainer().items.upsert<UserAccount>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update user." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("admin.users.update-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update user." }] };
  }
};

export const SetUserStatus = async (
  tenantSlug: string,
  id: string,
  status: UserStatus
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const existing = await FindUserById(tenantSlug, id);
    if (existing.status !== "OK") return existing;

    const { resource } = await ConfigContainer().items.upsert<UserAccount>({
      ...existing.response,
      status,
    });
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update user status." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("admin.users.set-status-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update user status." }] };
  }
};
