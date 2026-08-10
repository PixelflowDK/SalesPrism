import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { FindMeetingBriefsForOwner } from "@/features/sales-coach/meeting-brief-service";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * F-01 — `/briefs` list route. "Brief kan gemmes og genåbnes" acceptance
 * criterion: every meeting brief the seller has generated (across all chat
 * threads), reopenable here.
 */
export default async function BriefsPage() {
  const { tenantSlug, ownerId } = await getSalesCoachActorContext();
  const result = await FindMeetingBriefsForOwner(tenantSlug, ownerId);

  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  const briefs = result.response;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Meeting briefs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every meeting-preparation brief you&apos;ve generated in chat — saved and reopenable anytime.
        </p>
      </header>

      {briefs.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
          No meeting briefs yet. Ask Coach 360 to &ldquo;prepare me for a meeting&rdquo; to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {briefs.map((doc) => (
            <Link
              key={doc.id}
              href={`/briefs/${doc.id}`}
              className="flex items-center justify-between rounded-md border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div>
                <p className="font-display text-lg font-bold text-foreground">{doc.brief.customerName}</p>
                <p className="text-sm text-muted-foreground">{doc.brief.meetingTopic}</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {new Date(doc.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
