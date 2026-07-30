import { requireAdminContext } from "@/features/admin/admin-guard";
import { BuildActivityCsv } from "@/features/admin/activity-service";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { NextResponse } from "next/server";

/**
 * CSV export of the per-user activity table (SAD §8.6 / §15.4-style
 * on-request export, scoped to a single tenant). Admin-guarded server-side
 * — `requireAdminContext()` re-checks `isAdmin` and re-derives `tenantSlug`
 * from the request `Host` header; nothing here trusts client input.
 */
export async function GET(): Promise<Response> {
  const { tenantSlug } = await requireAdminContext();

  const themeResponse = await GetTenantTheme(tenantSlug);
  const userAnalyticsEnabled =
    themeResponse.status === "OK" && themeResponse.response.features.userAnalytics;

  if (!userAnalyticsEnabled) {
    return new NextResponse("Analytics is not enabled for this tenant.", { status: 403 });
  }

  const csvResponse = await BuildActivityCsv(tenantSlug);
  if (csvResponse.status !== "OK") {
    return new NextResponse("Unable to build activity export.", { status: 500 });
  }

  return new NextResponse(csvResponse.response, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tenantSlug}-activity-export.csv"`,
    },
  });
}
