import { requireAdminContext } from "@/features/admin/admin-guard";
import {
  setUserRoleAction,
  setUserStatusAction,
} from "@/features/admin/actions/user-actions";
import { FindUsersForTenant, UserAccount } from "@/features/admin/user-service";
import { GetTagDimensions } from "@/features/admin/group-service";
import { Button } from "@/features/ui/button";
import { Input } from "@/features/ui/input";
import { DisplayError } from "@/features/ui/error/display-error";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/features/ui/table";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ q?: string; tagKey?: string; tagValue?: string }>;
}

const matchesSearch = (user: UserAccount, q: string): boolean => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    user.displayName.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle)
  );
};

const matchesTagFilter = (
  user: UserAccount,
  tagKey?: string,
  tagValue?: string
): boolean => {
  if (!tagKey) return true;
  const value = user.tags[tagKey];
  if (!tagValue) return value !== undefined;
  return value === tagValue;
};

export default async function AdminUsersPage(props: Props) {
  const searchParams = await props.searchParams;
  const { tenantSlug } = await requireAdminContext();

  const [usersResponse, dimensionsResponse] = await Promise.all([
    FindUsersForTenant(tenantSlug),
    GetTagDimensions(tenantSlug),
  ]);

  if (usersResponse.status !== "OK") {
    return <DisplayError errors={usersResponse.errors} />;
  }

  const dimensions =
    dimensionsResponse.status === "OK" ? dimensionsResponse.response.dimensions : [];

  const filtered = usersResponse.response.filter(
    (u) =>
      matchesSearch(u, searchParams.q ?? "") &&
      matchesTagFilter(u, searchParams.tagKey, searchParams.tagValue)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <form className="flex flex-1 gap-3" method="GET">
          <Input
            name="q"
            placeholder="Search by name or email…"
            defaultValue={searchParams.q ?? ""}
            aria-label="Search users"
            className="max-w-sm"
          />
          <select
            name="tagKey"
            defaultValue={searchParams.tagKey ?? ""}
            aria-label="Filter by tag dimension"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">All tag dimensions</option>
            {dimensions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <Input
            name="tagValue"
            placeholder="Tag value (optional)"
            defaultValue={searchParams.tagValue ?? ""}
            aria-label="Tag value filter"
            className="max-w-[200px]"
          />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        <Button asChild>
          <Link href="/admin/users/new">New user</Link>
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/users/${user.id}`} className="hover:text-primary">
                    {user.displayName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <form action={setUserRoleAction.bind(null, user.id, user.role === "admin" ? "user" : "admin")}>
                    <button
                      type="submit"
                      className="rounded-pill border border-border-strong px-2 py-1 font-mono text-xs uppercase tracking-[0.08em] hover:border-primary hover:text-primary"
                    >
                      {user.role}
                    </button>
                  </form>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {Object.entries(user.tags)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      user.status === "active"
                        ? "text-success"
                        : "text-muted-foreground"
                    }
                  >
                    {user.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <form
                    action={setUserStatusAction.bind(
                      null,
                      user.id,
                      user.status === "active" ? "disabled" : "active"
                    )}
                  >
                    <Button variant="ghost" size="sm" type="submit">
                      {user.status === "active" ? "Disable" : "Reactivate"}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users match this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
