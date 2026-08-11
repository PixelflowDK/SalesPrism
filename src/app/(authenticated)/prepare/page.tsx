import { PrepareForm } from "@/features/sales-coach/components/prepare-form";
import { RecentBriefs } from "@/features/sales-coach/components/recent-briefs";
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { FindCustomerEntitiesForOwner } from "@/features/sales-coach/customer-entity-service";
import { FindMeetingBriefsForOwner } from "@/features/sales-coach/meeting-brief-service";
import { DisplayError } from "@/features/ui/error/display-error";

export const dynamic = "force-dynamic";

/**
 * W2 — `/prepare`, first-class Meeting Preparation (F-01). See
 * `prepare-form.tsx` doc-comment for how this hands off into the existing,
 * unmodified meeting-prep chat pipeline.
 */
export default async function PreparePage() {
  const { tenantSlug, ownerId } = await getSalesCoachActorContext();
  const [customersResult, briefsResult] = await Promise.all([
    FindCustomerEntitiesForOwner(tenantSlug, ownerId),
    FindMeetingBriefsForOwner(tenantSlug, ownerId),
  ]);

  if (customersResult.status !== "OK") {
    return <DisplayError errors={customersResult.errors} />;
  }
  if (briefsResult.status !== "OK") {
    return <DisplayError errors={briefsResult.errors} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360 · F-01</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Prepare for a meeting</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Structured meeting preparation using the 360° Customer Understanding Model — you don&apos;t need to
          remember which questions to ask yourself.
        </p>
      </header>

      <PrepareForm existingCustomerNames={customersResult.response.map((c) => c.customerName)} />

      <section>
        <h2 className="font-display text-lg font-bold text-foreground">Recent briefs</h2>
        <div className="mt-3">
          <RecentBriefs
            briefs={briefsResult.response.slice(0, 5)}
            emptyHint="No meeting briefs yet — the one you're about to start will show up here once it's saved."
          />
        </div>
      </section>
    </div>
  );
}
