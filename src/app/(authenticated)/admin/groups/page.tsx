import {
  addTagDimensionAction,
  deleteTagDimensionAction,
  renameTagDimensionAction,
} from "@/features/admin/actions/group-actions";
import { requireAdminContext } from "@/features/admin/admin-guard";
import { GetTagDimensions } from "@/features/admin/group-service";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { Input } from "@/features/ui/input";

export default async function AdminGroupsPage() {
  const { tenantSlug } = await requireAdminContext();
  const dimensionsResponse = await GetTagDimensions(tenantSlug);

  if (dimensionsResponse.status !== "OK") {
    return <DisplayError errors={dimensionsResponse.errors} />;
  }

  const { dimensions } = dimensionsResponse.response;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Tag dimensions are the flexible grouping keys your users can be tagged
        with (e.g. <span className="font-mono">land</span>,{" "}
        <span className="font-mono">afdeling</span>). All admins can see and
        manage every user regardless of tags — tags are for filtering and
        reporting only, per SAD §8.4.
      </p>

      <div className="rounded-md border border-border bg-card">
        {dimensions.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            No tag dimensions defined yet — add one below.
          </p>
        )}
        <ul>
          {dimensions.map((dimension) => (
            <li
              key={dimension}
              className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-0"
            >
              <span className="font-mono text-sm text-foreground">{dimension}</span>
              <div className="flex items-center gap-2">
                <form
                  action={renameTagDimensionAction.bind(null, dimension)}
                  className="flex items-center gap-2"
                >
                  <Input
                    name="newName"
                    placeholder="Rename to…"
                    aria-label={`Rename ${dimension}`}
                    className="h-9 w-40"
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Rename
                  </Button>
                </form>
                <form action={deleteTagDimensionAction.bind(null, dimension)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form
        action={addTagDimensionAction}
        className="flex items-end gap-3 rounded-md border-l-[3px] border-primary bg-ai p-5"
      >
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            New dimension name
          </label>
          <Input id="name" name="name" placeholder="e.g. afdeling" required />
        </div>
        <Button type="submit">Add dimension</Button>
      </form>
    </div>
  );
}
