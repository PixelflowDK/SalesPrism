import "server-only";

import { getCurrentUser, hashValue, userHashedId } from "@/features/auth-page/helpers";
import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
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
   * SHA-256 hash of the authenticated user's email (`userHashedId()`) —
   * the same identity value used throughout `chat-services/*`. This is
   * how `EnsureUserOnLogin` finds "my own" doc and how `EnsureChatThreadOperation`-style
   * ownership checks could later cross-reference a chat-history `userId`
   * back to a directory entry. Never the raw email/name.
   */
  hashedId: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  authMethod: UserAuthMethodSchema,
  tags: z.record(z.string(), z.string()),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  status: UserStatusSchema,
});
export type UserAccount = z.infer<typeof UserAccountSchema>;

const userAccountDocId = (tenantSlug: string, hashedId: string) =>
  `user-${tenantSlug}-${hashedId}`;

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

const findByHashedId = async (
  tenantSlug: string,
  hashedId: string
): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.hashedId=@hashedId",
      parameters: [
        { name: "@type", value: USER_ACCOUNT_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@hashedId", value: hashedId },
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
    const hashedId = await userHashedId();
    const tenantSlug = await getCurrentTenantSlug();
    const now = new Date().toISOString();

    const existing = await findByHashedId(tenantSlug, hashedId);

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
      return; // transient read error already logged by findByHashedId
    }

    const tenantTheme = await GetTenantTheme(tenantSlug);
    const authMethod: UserAuthMethod =
      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";

    const seeded: UserAccount = {
      id: userAccountDocId(tenantSlug, hashedId),
      type: USER_ACCOUNT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      hashedId,
      displayName: user.name,
      email: user.email,
      // First-ever user for a tenant, or any email covered by
      // ADMIN_EMAIL_ADDRESS, seeds as admin so a fresh tenant is never
      // locked out of its own /admin section.
      role: user.isAdmin ? "admin" : "user",
      authMethod,
      tags: {},
      createdAt: now,
      lastLoginAt: now,
      status: "active",
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

export const CreateUser = async (input: {
  displayName: string;
  email: string;
  role: UserRole;
  tags: Record<string, string>;
}): Promise<ServerActionResponse<UserAccount>> => {
  try {
    const tenantSlug = await getCurrentTenantSlug();
    const hashedId = hashValue(input.email.trim().toLowerCase());
    const tenantTheme = await GetTenantTheme(tenantSlug);
    const authMethod: UserAuthMethod =
      tenantTheme.status === "OK" ? tenantTheme.response.authMethod : "username-password";

    const now = new Date().toISOString();
    const model: UserAccount = {
      id: userAccountDocId(tenantSlug, hashedId),
      type: USER_ACCOUNT_ATTRIBUTE,
      userId: tenantSlug,
      tenantSlug,
      hashedId,
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      authMethod,
      tags: input.tags,
      createdAt: now,
      lastLoginAt: null,
      status: "active",
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
