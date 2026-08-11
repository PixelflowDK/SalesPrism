import Link from "next/link";
import { CustomerEntity } from "../models";

/** Shared "recent customers" list card — reused by `/home` (W1). */
export const RecentCustomers = ({
  customers,
  emptyHint,
}: {
  customers: CustomerEntity[];
  emptyHint: React.ReactNode;
}) => {
  if (customers.length === 0) {
    return <div className="rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">{emptyHint}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {customers.map((customer) => (
        <Link
          key={customer.id}
          href={`/customers/${customer.id}`}
          className="flex min-h-[44px] items-center justify-between rounded-md border border-border bg-card p-4 transition-colors hover:border-primary"
        >
          <div>
            <p className="font-display text-base font-bold text-foreground">{customer.customerName}</p>
            <p className="text-sm text-muted-foreground">
              {customer.contacts.length} contact{customer.contacts.length === 1 ? "" : "s"} ·{" "}
              {customer.knownChallenges.length} known challenge{customer.knownChallenges.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(customer.lastInteraction).toLocaleDateString()}
          </span>
        </Link>
      ))}
    </div>
  );
};
