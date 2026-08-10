import "server-only";

import { currentUserId } from "@/features/auth-page/helpers";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";

/**
 * Shared `{ tenantSlug, ownerId }` resolution for every Sales Coach
 * page/route that scopes data to "the current seller" — mirrors
 * `requireAdminContext()`'s pattern (admin-guard.ts) but without the
 * `isAdmin` check, since customers/briefs are per-seller data available to
 * every authenticated user, not an admin-only section.
 */
export const getSalesCoachActorContext = async (): Promise<{
  tenantSlug: string;
  ownerId: string;
}> => {
  const [tenantSlug, ownerId] = await Promise.all([
    getCurrentTenantSlug(),
    currentUserId(),
  ]);
  return { tenantSlug, ownerId };
};
