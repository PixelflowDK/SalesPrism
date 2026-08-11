import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { EnsureModuleConfig } from "@/features/sales-coach/context-injection";
import { SALES_COACH_MODULE_REGISTRY } from "@/features/sales-coach/models";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * W4 — `/modules`, the 7 Sales Coach models (SAD §27, feature-to-ui-audit.md
 * "Learning Modules do not exist as a product surface"). Reads the same
 * `ALL_MODULE_KEYS`/`SALES_COACH_MODULE_REGISTRY` used to build the chat
 * system prompt (context-injection.ts) — no methodology content is
 * fabricated here beyond what already exists there.
 */
export default async function ModulesPage() {
  const { tenantSlug } = await getSalesCoachActorContext();
  const configResult = await EnsureModuleConfig(tenantSlug);

  if (configResult.status !== "OK") {
    return <DisplayError errors={configResult.errors} />;
  }

  const modules = [...configResult.response.modules].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360 · SAD §27</p>
        <h1 className="font-display text-2xl font-bold text-foreground">The 7 Sales Coach models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Coach 360 applies these automatically in chat, meeting preparation and coaching feedback. Your workspace
          admin controls which are active.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {modules.map((m) => {
          const def = SALES_COACH_MODULE_REGISTRY[m.key];
          return (
            <Link
              key={m.key}
              href={`/modules/${m.key}`}
              className="flex min-h-[44px] flex-col gap-1 rounded-md border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-bold text-foreground">{m.customName ?? def.name}</p>
                <span
                  className={
                    m.active
                      ? "shrink-0 rounded-pill bg-secondary px-2 py-0.5 text-xs uppercase tracking-[0.06em] text-secondary-foreground"
                      : "shrink-0 rounded-pill border border-border-strong px-2 py-0.5 text-xs uppercase tracking-[0.06em] text-muted-foreground"
                  }
                >
                  {m.active ? "Active" : "Not active"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{def.essence}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
