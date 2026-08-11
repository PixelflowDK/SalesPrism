import { requireAdminContext } from "@/features/admin/admin-guard";
import { updateModuleConfigAction } from "@/features/sales-coach/actions/module-actions";
import { EnsureModuleConfig } from "@/features/sales-coach/context-injection";
import { SALES_COACH_MODULE_REGISTRY } from "@/features/sales-coach/models";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";

export const dynamic = "force-dynamic";

/** W4 — admin per-tenant enable/disable for the 7 Sales Coach models (SAD §27.3). */
export default async function AdminModulesPage() {
  const { tenantSlug } = await requireAdminContext();
  const configResult = await EnsureModuleConfig(tenantSlug);

  if (configResult.status !== "OK") {
    return <DisplayError errors={configResult.errors} />;
  }

  const modules = [...configResult.response.modules].sort((a, b) => a.order - b.order);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-md border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground">Sales Coach models</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable or disable which of the 7 Sales Coach models are active in this workspace&apos;s chat system
          prompt, meeting preparation and coaching feedback.
        </p>
        <form action={updateModuleConfigAction} className="mt-4 flex flex-col gap-3">
          {modules.map((m) => {
            const def = SALES_COACH_MODULE_REGISTRY[m.key];
            return (
              <label
                key={m.key}
                className="flex min-h-[44px] items-start gap-3 rounded-md border border-border p-3"
              >
                <input
                  type="checkbox"
                  name="activeModules"
                  value={m.key}
                  defaultChecked={m.active}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-medium text-foreground">{m.customName ?? def.name}</span>
                  <span className="block text-sm text-muted-foreground">{def.essence}</span>
                </span>
              </label>
            );
          })}
          <div>
            <Button type="submit" className="min-h-[44px]">
              Save changes
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
