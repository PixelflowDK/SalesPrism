import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetActivityOverview, GetPerUserActivity } from "@/features/admin/activity-service";
import { StatCard } from "@/features/admin/components/stat-card";
import { GetTenantTheme } from "@/features/theme/tenant-theme";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/features/ui/table";

export default async function AdminAnalyticsPage() {
  const { tenantSlug } = await requireAdminContext();
  const themeResponse = await GetTenantTheme(tenantSlug);

  const userAnalyticsEnabled =
    themeResponse.status === "OK" && themeResponse.response.features.userAnalytics;

  if (!userAnalyticsEnabled) {
    return (
      <div className="max-w-xl rounded-md border-l-[3px] border-tertiary bg-tertiary-light p-6">
        <h2 className="font-display text-lg font-bold text-foreground">
          Analytics is not enabled for this tenant
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Usage analytics (SAD §8.6) is a toggle in the tenant&apos;s
          TenantTheme configuration — default on for Enterprise, off for
          SMB/Professional. Ask your Sales Prism operator to enable{" "}
          <span className="font-mono">features.userAnalytics</span> for this
          tenant; no re-deployment is required.
        </p>
      </div>
    );
  }

  const [overviewResponse, perUserResponse] = await Promise.all([
    GetActivityOverview(tenantSlug),
    GetPerUserActivity(tenantSlug),
  ]);

  if (overviewResponse.status !== "OK") {
    return <DisplayError errors={overviewResponse.errors} />;
  }
  if (perUserResponse.status !== "OK") {
    return <DisplayError errors={perUserResponse.errors} />;
  }

  const overview = overviewResponse.response;
  const rows = perUserResponse.response;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Prompts this month" value={overview.totalPromptsThisMonth} />
        <StatCard label="Active users" value={overview.activeUsers} />
        <StatCard label="Inactive 30+ days" value={overview.inactiveUsers30d} />
        <StatCard label="Uploads this month" value={overview.uploadsThisMonth} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-foreground">Per-user activity</h2>
        <Button asChild variant="outline">
          <a href="/admin/analytics/export">Export CSV</a>
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Days inactive</TableHead>
              <TableHead>Prompts (month)</TableHead>
              <TableHead>Prompts (total)</TableHead>
              <TableHead>Uploads</TableHead>
              <TableHead>Tokens used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice()
              .sort((a, b) => b.promptsTotal - a.promptsTotal)
              .map((row) => (
                <TableRow key={row.hashedId}>
                  <TableCell className="font-medium">{row.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.daysSinceLastLogin ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.promptsThisMonth}</TableCell>
                  <TableCell className="font-mono text-xs">{row.promptsTotal}</TableCell>
                  <TableCell className="font-mono text-xs">{row.uploadsTotal}</TableCell>
                  <TableCell className="font-mono text-xs">{row.tokensUsedTotal}</TableCell>
                </TableRow>
              ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
