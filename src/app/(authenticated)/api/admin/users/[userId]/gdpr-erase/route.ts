import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import { EraseDataSubject } from "@/features/admin/gdpr-erasure-service";
import { safeLog } from "@/features/common/services/safe-logger";
import { NextRequest, NextResponse } from "next/server";

/**
 * GDPR erasure (Art. 17, "forget data subject X") — SAD v2.7 §32.3.
 *
 * `[userId]` is the `UserAccount` document id (same identifier already used
 * by `/admin/users/[id]` and its server actions — see
 * `user-service.ts`'s `userAccountDocId`), NOT a raw email.
 *
 * `requireAdminContext()` re-checks `isAdmin` and re-derives `tenantSlug`
 * from the request `Host` header server-side — this route NEVER trusts a
 * client-supplied tenant, exactly like every other admin route/action in
 * this app. `EraseDataSubject` itself re-verifies the subject belongs to
 * this tenant (`FindUserById` is tenant-partition-scoped) before deleting
 * anything, so a `userId` from a different tenant returns 404 with zero
 * side effects.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  let tenantSlug: string;
  let performedById: string;

  try {
    const adminContext = await requireAdminContext();
    tenantSlug = adminContext.tenantSlug;
    performedById = adminContext.canonicalUserId;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;

  const result = await EraseDataSubject({
    tenantSlug,
    subjectUserId: userId,
    performedById,
  });

  if (result.status === "NOT_FOUND") {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (result.status !== "OK") {
    safeLog.error("gdpr.erasure.route-failed", { tenantSlug });
    return NextResponse.json({ error: "Unable to complete erasure." }, { status: 500 });
  }

  return NextResponse.json(
    {
      subjectId: result.response.subjectId,
      timestamp: result.response.timestamp,
      counts: result.response.counts,
    },
    { status: 200 }
  );
}
