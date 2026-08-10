import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { FindCustomerEntitiesForOwner } from "@/features/sales-coach/customer-entity-service";
import { VALUE_AREA_LABELS } from "@/features/sales-coach/models";
import { DisplayError } from "@/features/ui/error/display-error";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * F-03 — `/customers` list route. Per-seller customer intelligence, built
 * automatically from chat via `extraction-service.ts`'s onFinish hook, and
 * editable here (see `/customers/[id]`).
 */
export default async function CustomersPage() {
  const { tenantSlug, ownerId } = await getSalesCoachActorContext();
  const result = await FindCustomerEntitiesForOwner(tenantSlug, ownerId);

  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  const customers = result.response;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">Coach 360</p>
        <h1 className="font-display text-2xl font-bold text-foreground">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automatically built from your conversations with Coach 360 — review and edit anytime.
        </p>
      </header>

      {customers.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
          No customers yet. Mention a customer by name in chat and Coach 360 will start building their profile
          automatically.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold text-foreground">{customer.customerName}</p>
                <span className="font-mono text-xs text-muted-foreground">
                  Last interaction {new Date(customer.lastInteraction).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {customer.contacts.length} contact{customer.contacts.length === 1 ? "" : "s"} ·{" "}
                {customer.knownChallenges.length} known challenge{customer.knownChallenges.length === 1 ? "" : "s"}
              </p>
              {customer.valueAreas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customer.valueAreas.map((v) => (
                    <span
                      key={v}
                      className="rounded-pill bg-secondary px-2 py-0.5 text-xs uppercase tracking-[0.06em] text-secondary-foreground"
                    >
                      {VALUE_AREA_LABELS[v]}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
