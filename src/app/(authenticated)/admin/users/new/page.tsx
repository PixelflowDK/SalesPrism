import { createUserAction } from "@/features/admin/actions/user-actions";
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetTagDimensions } from "@/features/admin/group-service";
import { Button } from "@/features/ui/button";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import Link from "next/link";

export default async function NewUserPage() {
  const { tenantSlug } = await requireAdminContext();
  const dimensionsResponse = await GetTagDimensions(tenantSlug);
  const dimensions =
    dimensionsResponse.status === "OK" ? dimensionsResponse.response.dimensions : [];

  return (
    <div className="max-w-lg rounded-md border-l-[3px] border-primary bg-ai p-6">
      <h2 className="font-display text-lg font-bold text-foreground">New user</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Creates a directory entry for this tenant. No welcome email is sent yet —
        Entra External ID Graph integration (SAD §8.3) is deferred until the
        shared CIAM tenant exists.
      </p>

      <form action={createUserAction} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue="user"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tags">
            Tags {dimensions.length > 0 && `(known dimensions: ${dimensions.join(", ")})`}
          </Label>
          <Textarea
            id="tags"
            name="tags"
            placeholder={"afdeling: Sales Operations\nby: Hedehusene"}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">One &quot;dimension: value&quot; pair per line.</p>
        </div>
        <div className="flex gap-3">
          <Button type="submit">Create user</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/users">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
