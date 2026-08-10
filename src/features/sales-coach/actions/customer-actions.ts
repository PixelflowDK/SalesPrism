"use server";
import "server-only";

import { currentUserId } from "@/features/auth-page/helpers";
import { safeLog } from "@/features/common/services/safe-logger";
import { getCurrentTenantSlug } from "@/features/theme/tenant-resolver";
import { revalidatePath } from "next/cache";
import {
  FindCustomerEntityById,
  UpdateCustomerEntity,
} from "../customer-entity-service";
import { ValueArea, ValueAreaSchema } from "../models";

/**
 * `/customers/[id]` edit-form server actions. Every action re-derives
 * `tenantSlug` + the current seller's `ownerId` from the session —
 * a client can never supply either, matching the `admin/actions/*` pattern.
 */

const parseLines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const parseValueAreas = (formData: FormData): ValueArea[] => {
  const values = formData.getAll("valueAreas").map(String);
  return values.filter((v): v is ValueArea => ValueAreaSchema.safeParse(v).success);
};

export const updateCustomerProfileAction = async (
  customerId: string,
  formData: FormData
): Promise<void> => {
  const tenantSlug = await getCurrentTenantSlug();
  const ownerId = await currentUserId();

  const customerName = String(formData.get("customerName") ?? "").trim();
  const knownChallenges = parseLines(String(formData.get("knownChallenges") ?? ""));
  const valueAreas = parseValueAreas(formData);

  if (!customerName) {
    throw new Error("Customer name is required.");
  }

  const result = await UpdateCustomerEntity(tenantSlug, ownerId, customerId, {
    customerName,
    knownChallenges,
    valueAreas,
  });

  if (result.status !== "OK") {
    safeLog.warn("sales-coach.customers.update-rejected", { tenantSlug });
    throw new Error(result.errors[0]?.message ?? "Unable to update customer.");
  }

  revalidatePath(`/customers/${customerId}`);
};

/** Edits a single contact's free-text notes (F-03 "Sælger kan se og redigere kundens profil"). */
export const updateContactNotesAction = async (
  customerId: string,
  contactName: string,
  formData: FormData
): Promise<void> => {
  const tenantSlug = await getCurrentTenantSlug();
  const ownerId = await currentUserId();

  const existing = await FindCustomerEntityById(tenantSlug, ownerId, customerId);
  if (existing.status !== "OK") {
    throw new Error(existing.status === "NOT_FOUND" ? "Customer not found." : "Unable to load customer.");
  }

  const notes = String(formData.get("notes") ?? "");
  const updatedContacts = existing.response.contacts.map((contact) =>
    contact.name === contactName ? { ...contact, notes } : contact
  );

  const result = await UpdateCustomerEntity(tenantSlug, ownerId, customerId, {
    contacts: updatedContacts,
  });

  if (result.status !== "OK") {
    safeLog.warn("sales-coach.customers.notes-update-rejected", { tenantSlug });
    throw new Error(result.errors[0]?.message ?? "Unable to update contact notes.");
  }

  revalidatePath(`/customers/${customerId}`);
};
