import "server-only";

import { getCurrentUser, userHashedId } from "@/features/auth-page/helpers";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { safeLog } from "@/features/common/services/safe-logger";

export type AdminContext = {
  tenantSlug: string;
  hashedId: string;
  displayName: string;
  email: string;
};

/**
 * Server-side admin-role + tenant-scope guard shared by every `/admin`
 * page and server action.
 *
 * Defense in depth: `src/middleware.ts` already blocks non-admin sessions
 * from reaching `/admin/*` at the edge using the NextAuth JWT's `isAdmin`
 * claim, but every admin server action here re-checks `isAdmin` itself
 * (never trust client input for role/tenant — CLAUDE.md) and always
 * re-derives `tenantSlug` from the request `Host` header (Stage 4
 * resolver), never from a client-supplied value. Throws instead of
 * returning a `ServerActionResponse` so a forgotten guard check fails
 * loudly rather than silently leaking data.
 */
export const requireAdminContext = async (): Promise<AdminContext> => {
  const user = await getCurrentUser();

  if (!user.isAdmin) {
    safeLog.warn("admin.access-denied");
    throw new Error("Forbidden: admin role required");
  }

  const tenantSlug = await getCurrentTenantSlug();
  const hashedId = await userHashedId();

  return {
    tenantSlug,
    hashedId,
    displayName: user.name,
    email: user.email,
  };
};
