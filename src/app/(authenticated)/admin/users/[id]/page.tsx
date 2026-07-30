import { updateUserAction } from "@/features/admin/actions/user-actions";
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetTagDimensions } from "@/features/admin/group-service";
import { FindUserById } from "@/features/admin/user-service";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage(props: Props) {
  const { id } = await props.params;
  const { tenantSlug } = await requireAdminContext();

  const [userResponse, dimensionsResponse] = await Promise.all([
    FindUserById(tenantSlug, id),
    GetTagDimensions(tenantSlug),
  ]);

  if (userResponse.status !== "OK") {
    return <DisplayError errors={userResponse.errors} />;
  }

  const user = userResponse.response;
  const dimensions =
    dimensionsResponse.status === "OK" ? dimensionsResponse.response.dimensions : [];
  const tagsText = Object.entries(user.tags)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <div className="max-w-lg rounded-md border-l-[3px] border-primary bg-ai p-6">
      <h2 className="font-display text-lg font-bold text-foreground">
        Edit {user.displayName}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Auth method: <span className="font-mono">{user.authMethod}</span> · Status:{" "}
        <span className="font-mono">{user.status}</span>
      </p>

      <form
        action={updateUserAction.bind(null, user.id)}
        className="mt-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" name="displayName" defaultValue={user.displayName} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={user.email} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue={user.role}
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
          <Textarea id="tags" name="tags" defaultValue={tagsText} rows={4} />
          <p className="text-xs text-muted-foreground">One &quot;dimension: value&quot; pair per line.</p>
        </div>
        <div className="flex gap-3">
          <Button type="submit">Save changes</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/users">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
