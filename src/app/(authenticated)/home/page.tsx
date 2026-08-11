import { GetActiveModules } from "@/features/sales-coach/context-injection";
import { RecentBriefs } from "@/features/sales-coach/components/recent-briefs";
import { RecentCustomers } from "@/features/sales-coach/components/recent-customers";
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { FindCustomerEntitiesForOwner } from "@/features/sales-coach/customer-entity-service";
import { FindMeetingBriefsForOwner } from "@/features/sales-coach/meeting-brief-service";
import { ALL_MODULE_KEYS } from "@/features/sales-coach/models";
import { AI_NAME } from "@/features/theme/theme-config";
import { DisplayError } from "@/features/ui/error/display-error";
import { ClipboardList, GraduationCap, LayoutGrid } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * W1 — `/home` seller landing surface (feature-to-ui-audit.md: "No
 * Home/dashboard. 'Home' points at /chat."). The sidebar's Home link now
 * points here (see main-menu.tsx); `/chat` remains reachable as its own nav
 * item for freeform conversation.
 *
 * Every empty state below teaches the next action rather than just
 * reporting absence — CLAUDE.md "Empty states must teach, not just say
 * 'nothing here'".
 */
export default async function HomePage() {
  const { tenantSlug, ownerId } = await getSalesCoachActorContext();

  const [briefsResult, customersResult, activeModules] = await Promise.all([
    FindMeetingBriefsForOwner(tenantSlug, ownerId),
    FindCustomerEntitiesForOwner(tenantSlug, ownerId),
    GetActiveModules(tenantSlug),
  ]);

  if (briefsResult.status !== "OK") {
    return <DisplayError errors={briefsResult.errors} />;
  }
  if (customersResult.status !== "OK") {
    return <DisplayError errors={customersResult.errors} />;
  }

  const recentBriefs = briefsResult.response.slice(0, 3);
  const recentCustomers = customersResult.response.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {AI_NAME} applies the Sales Coach methodology automatically — start with one of the two moves below.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Primary actions">
        <Link
          href="/prepare"
          className="flex min-h-[44px] flex-col gap-3 rounded-md border-l-[3px] border-primary bg-ai p-6 transition-colors hover:bg-primary-light"
        >
          <ClipboardList size={22} className="text-primary" aria-hidden="true" />
          <p className="font-display text-lg font-bold text-foreground">Prepare for a meeting</p>
          <p className="text-sm text-muted-foreground">
            Pick a customer and topic — Coach 360 asks the 4 guiding 360° questions and builds your brief.
          </p>
        </Link>
        <Link
          href="/coach"
          className="flex min-h-[44px] flex-col gap-3 rounded-md border-l-[3px] border-tertiary bg-tertiary-light p-6 transition-colors hover:bg-accent"
        >
          <GraduationCap size={22} className="text-tertiary" aria-hidden="true" />
          <p className="font-display text-lg font-bold text-foreground">Get coaching on a conversation</p>
          <p className="text-sm text-muted-foreground">
            Describe what happened in a meeting and get 1st/2nd Position feedback with concrete alternatives.
          </p>
        </Link>
      </section>

      <section aria-labelledby="recent-briefs-heading">
        <div className="flex items-center justify-between">
          <h2 id="recent-briefs-heading" className="font-display text-lg font-bold text-foreground">
            Recent briefs
          </h2>
          {recentBriefs.length > 0 && (
            <Link href="/briefs" className="text-sm text-primary-text hover:underline">
              View all
            </Link>
          )}
        </div>
        <div className="mt-3">
          <RecentBriefs
            briefs={recentBriefs}
            emptyHint={
              <>
                No meeting briefs yet.{" "}
                <Link href="/prepare" className="text-primary-text hover:underline">
                  Prepare for your first meeting
                </Link>{" "}
                and Coach 360 will build one with you.
              </>
            }
          />
        </div>
      </section>

      <section aria-labelledby="recent-customers-heading">
        <div className="flex items-center justify-between">
          <h2 id="recent-customers-heading" className="font-display text-lg font-bold text-foreground">
            Recent customers
          </h2>
          {recentCustomers.length > 0 && (
            <Link href="/customers" className="text-sm text-primary-text hover:underline">
              View all
            </Link>
          )}
        </div>
        <div className="mt-3">
          <RecentCustomers
            customers={recentCustomers}
            emptyHint={
              <>
                No customers yet. Mention a customer by name in{" "}
                <Link href="/chat" className="text-primary-text hover:underline">
                  chat
                </Link>{" "}
                or start a{" "}
                <Link href="/prepare" className="text-primary-text hover:underline">
                  meeting preparation
                </Link>{" "}
                and Coach 360 builds their profile automatically.
              </>
            }
          />
        </div>
      </section>

      <section>
        <Link
          href="/modules"
          className="flex min-h-[44px] items-center justify-between rounded-md border border-border bg-card p-5 transition-colors hover:border-primary"
        >
          <div className="flex items-center gap-3">
            <LayoutGrid size={20} className="text-primary" aria-hidden="true" />
            <div>
              <p className="font-display text-base font-bold text-foreground">The 7 Sales Coach models</p>
              <p className="text-sm text-muted-foreground">
                {activeModules.length} of {ALL_MODULE_KEYS.length} active for your workspace
              </p>
            </div>
          </div>
          <span className="text-sm text-primary-text">Explore →</span>
        </Link>
      </section>
    </div>
  );
}
