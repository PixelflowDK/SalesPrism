import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { uniqueId } from "@/features/common/util";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  CUSTOMER_ENTITY_ATTRIBUTE,
  CustomerContact,
  CustomerEntity,
  CustomerEntitySchema,
  ValueArea,
} from "./models";

/**
 * Customer Entity Service — SHARED 1 (backlog "Tekniske Fælles-komponenter").
 * Used by F-01, F-02, F-03, F-04.
 *
 * Every read/write below filters on BOTH `tenantSlug` (the Cosmos partition
 * key, `ConfigContainer` convention — see models.ts module doc) AND
 * `ownerHashedId` (the owning seller's hashed identity). Never drop the
 * `ownerHashedId` filter from a query — a seller's customer intelligence is
 * private to that seller; cross-user leakage here is a security bug, not
 * just a data-quality bug.
 */

const customerEntityDocId = () => `customer-${uniqueId()}`;

const normalizeCustomerName = (name: string): string => name.trim().toLowerCase();

const parseCustomerEntity = (raw: unknown): ServerActionResponse<CustomerEntity> => {
  const parsed = CustomerEntitySchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
  }
  return { status: "OK", response: parsed.data };
};

/** All customer entities owned by the current seller, for this tenant. Powers the `/customers` list view. */
export const FindCustomerEntitiesForOwner = async (
  tenantSlug: string,
  ownerHashedId: string
): Promise<ServerActionResponse<CustomerEntity[]>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId ORDER BY r.lastInteraction DESC",
      parameters: [
        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@ownerHashedId", value: ownerHashedId },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<CustomerEntity>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    return { status: "OK", response: resources };
  } catch (error) {
    safeLog.error("sales-coach.customers.list-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load customers." }] };
  }
};

/** Single customer entity by id — re-checks `ownerHashedId` even after the partition-scoped point read. */
export const FindCustomerEntityById = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string
): Promise<ServerActionResponse<CustomerEntity>> => {
  try {
    const { resource } = await ConfigContainer().item(id, tenantSlug).read<CustomerEntity>();

    if (!resource || resource.tenantSlug !== tenantSlug || resource.ownerHashedId !== ownerHashedId) {
      return { status: "NOT_FOUND", errors: [{ message: "Customer not found." }] };
    }

    return parseCustomerEntity(resource);
  } catch (error) {
    safeLog.error("sales-coach.customers.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load customer." }] };
  }
};

/** Case-insensitive lookup by customer name, scoped to this seller. Used by F-01 proactive context + F-03 upsert-by-name. */
export const FindCustomerEntityByName = async (
  tenantSlug: string,
  ownerHashedId: string,
  customerName: string
): Promise<ServerActionResponse<CustomerEntity>> => {
  try {
    const querySpec: SqlQuerySpec = {
      query:
        "SELECT * FROM root r WHERE r.type=@type AND r.tenantSlug=@tenantSlug AND r.ownerHashedId=@ownerHashedId AND r.customerNameNormalized=@name",
      parameters: [
        { name: "@type", value: CUSTOMER_ENTITY_ATTRIBUTE },
        { name: "@tenantSlug", value: tenantSlug },
        { name: "@ownerHashedId", value: ownerHashedId },
        { name: "@name", value: normalizeCustomerName(customerName) },
      ],
    };

    const { resources } = await ConfigContainer()
      .items.query<CustomerEntity>(querySpec, { partitionKey: tenantSlug })
      .fetchAll();

    if (resources.length === 0) {
      return { status: "NOT_FOUND", errors: [{ message: "Customer not found." }] };
    }
    return parseCustomerEntity(resources[0]);
  } catch (error) {
    safeLog.error("sales-coach.customers.lookup-by-name-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load customer." }] };
  }
};

export const CreateCustomerEntity = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  customerName: string;
  knownChallenges?: string[];
  contacts?: CustomerContact[];
  valueAreas?: ValueArea[];
}): Promise<ServerActionResponse<CustomerEntity>> => {
  try {
    const now = new Date().toISOString();
    const model: CustomerEntity = {
      id: customerEntityDocId(),
      type: CUSTOMER_ENTITY_ATTRIBUTE,
      userId: input.tenantSlug,
      tenantSlug: input.tenantSlug,
      ownerHashedId: input.ownerHashedId,
      customerName: input.customerName,
      customerNameNormalized: normalizeCustomerName(input.customerName),
      contacts: input.contacts ?? [],
      knownChallenges: input.knownChallenges ?? [],
      lastInteraction: now,
      meetingHistory: [],
      valueAreas: input.valueAreas ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const parsed = CustomerEntitySchema.safeParse(model);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }

    const { resource } = await ConfigContainer().items.create<CustomerEntity>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to create customer." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    safeLog.error("sales-coach.customers.create-failed", { tenantSlug: input.tenantSlug, statusCode: code });
    return { status: "ERROR", errors: [{ message: "Unable to create customer." }] };
  }
};

/** Editable-fields patch (contacts / challenges / notes) — used by the `/customers/[id]` edit form. */
export const UpdateCustomerEntity = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string,
  patch: Partial<Pick<CustomerEntity, "customerName" | "contacts" | "knownChallenges" | "valueAreas">>
): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
  if (existing.status !== "OK") return existing;

  try {
    const updated: CustomerEntity = {
      ...existing.response,
      ...patch,
      customerNameNormalized: patch.customerName
        ? normalizeCustomerName(patch.customerName)
        : existing.response.customerNameNormalized,
      updatedAt: new Date().toISOString(),
    };

    const parsed = CustomerEntitySchema.safeParse(updated);
    if (!parsed.success) {
      return { status: "ERROR", errors: zodErrorsToServerActionErrors(parsed.error.errors) };
    }

    const { resource } = await ConfigContainer().items.upsert<CustomerEntity>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.customers.update-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
  }
};

const dedupe = (values: string[]): string[] => Array.from(new Set(values.filter((v) => v.trim().length > 0)));

const mergeContacts = (
  existing: CustomerContact[],
  incoming: CustomerContact[]
): CustomerContact[] => {
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  for (const contact of incoming) {
    const key = contact.name.trim().toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, contact);
      continue;
    }
    // Merge: prefer newly-classified fields, keep prior ones as fallback, union arrays.
    byName.set(key, {
      name: current.name,
      title: contact.title || current.title,
      personaType: contact.personaType ?? current.personaType,
      primaryValueArea: contact.primaryValueArea ?? current.primaryValueArea,
      secondaryValueArea: contact.secondaryValueArea ?? current.secondaryValueArea,
      knownTriggers: dedupe([...current.knownTriggers, ...contact.knownTriggers]),
      communicationTips: contact.communicationTips.length > 0 ? contact.communicationTips : current.communicationTips,
      suggestedQuestions: contact.suggestedQuestions.length > 0 ? contact.suggestedQuestions : current.suggestedQuestions,
      notes: contact.notes || current.notes,
    });
  }
  return Array.from(byName.values());
};

/**
 * F-03 auto-extraction upsert: finds-or-creates a customer entity for
 * `customerName`, merges in newly-observed challenges/triggers/value-areas/
 * contacts, and bumps `lastInteraction`. Called from
 * `extraction-service.ts`'s onFinish hook — never called directly from the
 * request/response path.
 */
export const UpsertCustomerEntityFromExtraction = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  customerName: string;
  newChallenges?: string[];
  newValueAreas?: ValueArea[];
  newContacts?: CustomerContact[];
}): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityByName(input.tenantSlug, input.ownerHashedId, input.customerName);

  if (existing.status === "OK") {
    return UpdateCustomerEntityInteraction(input.tenantSlug, input.ownerHashedId, existing.response.id, {
      newChallenges: input.newChallenges,
      newValueAreas: input.newValueAreas,
      newContacts: input.newContacts,
    });
  }

  if (existing.status !== "NOT_FOUND") {
    return existing;
  }

  return CreateCustomerEntity({
    tenantSlug: input.tenantSlug,
    ownerHashedId: input.ownerHashedId,
    customerName: input.customerName,
    knownChallenges: dedupe(input.newChallenges ?? []),
    valueAreas: Array.from(new Set(input.newValueAreas ?? [])),
    contacts: input.newContacts ?? [],
  });
};

/** Merges new observations into an existing entity and refreshes `lastInteraction` — does not touch the customer name. */
export const UpdateCustomerEntityInteraction = async (
  tenantSlug: string,
  ownerHashedId: string,
  id: string,
  input: {
    newChallenges?: string[];
    newValueAreas?: ValueArea[];
    newContacts?: CustomerContact[];
  }
): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityById(tenantSlug, ownerHashedId, id);
  if (existing.status !== "OK") return existing;

  try {
    const updated: CustomerEntity = {
      ...existing.response,
      knownChallenges: dedupe([...existing.response.knownChallenges, ...(input.newChallenges ?? [])]),
      valueAreas: Array.from(new Set([...existing.response.valueAreas, ...(input.newValueAreas ?? [])])),
      contacts: mergeContacts(existing.response.contacts, input.newContacts ?? []),
      lastInteraction: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await ConfigContainer().items.upsert<CustomerEntity>(updated);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.customers.interaction-update-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to update customer." }] };
  }
};

/** Links a saved MeetingBrief (F-01) into the customer's `meetingHistory` — creates the entity if it doesn't exist yet. */
export const LinkMeetingBriefToCustomer = async (input: {
  tenantSlug: string;
  ownerHashedId: string;
  customerName: string;
  meetingBriefId: string;
}): Promise<ServerActionResponse<CustomerEntity>> => {
  const existing = await FindCustomerEntityByName(input.tenantSlug, input.ownerHashedId, input.customerName);

  const target =
    existing.status === "OK"
      ? existing
      : existing.status === "NOT_FOUND"
      ? await CreateCustomerEntity({
          tenantSlug: input.tenantSlug,
          ownerHashedId: input.ownerHashedId,
          customerName: input.customerName,
        })
      : existing;

  if (target.status !== "OK") return target;

  try {
    const updated: CustomerEntity = {
      ...target.response,
      meetingHistory: dedupe([...target.response.meetingHistory, input.meetingBriefId]),
      lastInteraction: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { resource } = await ConfigContainer().items.upsert<CustomerEntity>(updated);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to link meeting brief." }] };
    }
    return { status: "OK", response: resource };
  } catch (error) {
    safeLog.error("sales-coach.customers.link-brief-failed", { tenantSlug: input.tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to link meeting brief." }] };
  }
};
