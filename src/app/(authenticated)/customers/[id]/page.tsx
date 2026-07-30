import { updateContactNotesAction, updateCustomerProfileAction } from "@/features/sales-coach/actions/customer-actions";
import { getSalesCoachActorContext } from "@/features/sales-coach/actor-context";
import { PersonaCard } from "@/features/sales-coach/components/persona-card";
import { FindCustomerEntityById } from "@/features/sales-coach/customer-entity-service";
import { VALUE_AREA_LABELS, ValueArea } from "@/features/sales-coach/models";
import { Button } from "@/features/ui/button";
import { DisplayError } from "@/features/ui/error/display-error";
import { Input } from "@/features/ui/input";
import { Label } from "@/features/ui/label";
import { Textarea } from "@/features/ui/textarea";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

const ALL_VALUE_AREAS: ValueArea[] = [
  "speed-agility",
  "people-processes",
  "risk-governance",
  "economics-control",
  "sustainability-responsibility",
];

/**
 * F-03 customer profile detail + F-04 persona cards.
 * DESIGN.md "Customer Profile — DSV Logistics" screen conventions.
 */
export default async function CustomerDetailPage(props: Props) {
  const { id } = await props.params;
  const { tenantSlug, ownerHashedId } = await getSalesCoachActorContext();

  const result = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
  if (result.status !== "OK") {
    return <DisplayError errors={result.errors} />;
  }

  const customer = result.response;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/customers" className="text-sm text-muted-foreground hover:text-primary-text">
            ← Customers
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">{customer.customerName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.meetingHistory.length} saved brief{customer.meetingHistory.length === 1 ? "" : "s"} · Last
            interaction {new Date(customer.lastInteraction).toLocaleDateString()}
          </p>
        </div>
      </header>

      <section className="rounded-md border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground">Profile</h2>
        <form action={updateCustomerProfileAction.bind(null, customer.id)} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customerName">Customer name</Label>
            <Input id="customerName" name="customerName" defaultValue={customer.customerName} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="knownChallenges">Known challenges</Label>
            <Textarea
              id="knownChallenges"
              name="knownChallenges"
              rows={4}
              defaultValue={customer.knownChallenges.join("\n")}
            />
            <p className="text-xs text-muted-foreground">One challenge per line.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Value areas</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_VALUE_AREAS.map((area) => (
                <label key={area} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="valueAreas"
                    value={area}
                    defaultChecked={customer.valueAreas.includes(area)}
                  />
                  {VALUE_AREA_LABELS[area]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </section>

      {customer.meetingHistory.length > 0 && (
        <section className="rounded-md border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Meeting briefs</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {customer.meetingHistory.map((briefId) => (
              <li key={briefId}>
                <Link href={`/briefs/${briefId}`} className="text-sm text-primary-text hover:underline">
                  {briefId}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-bold text-foreground">Stakeholders</h2>
        {customer.contacts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No stakeholders identified yet. Mention a person&apos;s name and title in chat and Coach 360 will build
            their persona profile automatically.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {customer.contacts.map((contact) => (
              <div key={contact.name} className="flex flex-col gap-3">
                <PersonaCard contact={contact} />
                <form
                  action={updateContactNotesAction.bind(null, customer.id, contact.name)}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card p-4"
                >
                  <Label htmlFor={`notes-${contact.name}`}>Notes — {contact.name}</Label>
                  <Textarea
                    id={`notes-${contact.name}`}
                    name="notes"
                    rows={2}
                    defaultValue={contact.notes}
                  />
                  <div>
                    <Button type="submit" variant="outline" size="sm">
                      Save notes
                    </Button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
