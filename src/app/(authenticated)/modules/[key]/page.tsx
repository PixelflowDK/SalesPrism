import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { EnsureModuleConfig } from "@/features/sales-coach/context-injection";
import { ModuleKeySchema, SALES_COACH_MODULE_REGISTRY } from "@/features/sales-coach/models";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ key: string }>;
}

export const dynamic = "force-dynamic";

/** W4 — per-model detail, reusing the exact same registry entry as `/modules`. */
export default async function ModuleDetailPage(props: Props) {
  const { key } = await props.params;
  const parsedKey = ModuleKeySchema.safeParse(key);
  if (!parsedKey.success) {
    notFound();
  }

  const { tenantSlug } = await getSalesCoachActorContext();
  const configResult = await EnsureModuleConfig(tenantSlug);
  if (configResult.status !== "OK") {
    return <DisplayError errors={configResult.errors} />;
  }

  const entry = configResult.response.modules.find((m) => m.key === parsedKey.data);
  const def = SALES_COACH_MODULE_REGISTRY[parsedKey.data];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-8 py-8">
      <Link href="/modules" className="text-sm text-muted-foreground hover:text-primary-text">
        ← The 7 Sales Coach models
      </Link>
      <div className="rounded-md border-l-[3px] border-primary bg-ai px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <h1 className="font-display text-2xl font-bold text-foreground">{entry?.customName ?? def.name}</h1>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {entry?.active ? "Active for your workspace" : "Not active for your workspace"}
          </span>
        </div>
        <p className="mt-4 text-base text-foreground">{def.essence}</p>
      </div>
    </div>
  );
}
