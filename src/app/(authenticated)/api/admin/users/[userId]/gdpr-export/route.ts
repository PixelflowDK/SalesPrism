import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import { ExportDataSubject } from "@/features/admin/gdpr-export-service";
import { safeLog } from "@/features/common/services/safe-logger";
import { NextRequest, NextResponse } from "next/server";

/**
 * GDPR data-subject export (Art. 15 right of access / Art. 20 portability) —
 * SAD v2.7 Phase D, "On-request dataeksport".
 *
 * `[userId]` is the `UserAccount` document id — the same identifier
 * `/admin/users/[id]` and the sibling `gdpr-erase` route already use, never a
 * raw email.
 *
 * `requireAdminContext()` is called INSIDE this handler. Middleware also
 * covers `/api/admin`, and that is deliberate redundancy, not a reason to
 * skip the check here: a route handler that depends on middleware for its
 * authorization is one matcher edit away from being public, and this one
 * returns every piece of personal data the platform holds about a person.
 *
 * GET rather than POST because it is a pure read — `ExportDataSubject`
 * performs no delete, update or upsert. An access request must not mutate
 * the record it reports on.
 */
export async function GET(
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

  const result = await ExportDataSubject({
    tenantSlug,
    subjectUserId: userId,
    performedById,
  });

  if (result.status === "NOT_FOUND") {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (result.status !== "OK") {
    safeLog.error("gdpr.export.route-failed", { tenantSlug });
    return NextResponse.json({ error: "Unable to build export." }, { status: 500 });
  }

  // The filename carries the account document id, never the subject's email or
  // display name: the file is downloaded to an admin's workstation, may be
  // forwarded, and may sit in a shared downloads folder — the name should not
  // itself disclose who it is about.
  const filename = `sales-prism-export-${userId}.json`;

  return new NextResponse(JSON.stringify(result.response, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // This payload is the maximum-sensitivity response the app can produce.
      // It must never sit in a browser, proxy or CDN cache.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
