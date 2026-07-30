"use server";
import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import {
  CreateUser,
  SetUserStatus,
  UpdateUser,
  UserRole,
  UserStatus,
} from "@/features/admin/user-service";
import { safeLog } from "@/features/common/services/safe-logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * All server actions below re-derive `tenantSlug` and re-check `isAdmin`
 * via `requireAdminContext()` on every call — a client can never supply
 * either. Form actions here intentionally return `Promise<void>` (rather
 * than the `ServerActionResponse<T>` shape used by data-fetching services)
 * to match the React 19 `<form action={fn}>` contract; failures are logged
 * via `safeLog` and re-thrown so Next renders the nearest error boundary —
 * acceptable for an internal admin tool, revisit with inline field errors
 * in a later pass if desired.
 */

/** Parses the users-table's tag editor textarea format: one `key: value` pair per line. */
const parseTagLines = (raw: string): Record<string, string> => {
  const tags: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split(":");
    const trimmedKey = key?.trim();
    const value = rest.join(":").trim();
    if (trimmedKey && value) {
      tags[trimmedKey] = value;
    }
  }
  return tags;
};

export const createUserAction = async (formData: FormData): Promise<void> => {
  await requireAdminContext(); // throws if not admin — never trust the client

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "user") as UserRole;
  const tags = parseTagLines(String(formData.get("tags") ?? ""));

  if (!displayName || !email) {
    throw new Error("Display name and email are required.");
  }

  const result = await CreateUser({ displayName, email, role, tags });
  if (result.status !== "OK") {
    safeLog.warn("admin.users.create-rejected");
    throw new Error(result.errors[0]?.message ?? "Unable to create user.");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
};

export const updateUserAction = async (
  id: string,
  formData: FormData
): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "user") as UserRole;
  const tags = parseTagLines(String(formData.get("tags") ?? ""));

  const result = await UpdateUser(tenantSlug, id, { displayName, email, role, tags });
  if (result.status !== "OK") {
    throw new Error(result.errors[0]?.message ?? "Unable to update user.");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
};

export const setUserStatusAction = async (
  id: string,
  status: UserStatus
): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  await SetUserStatus(tenantSlug, id, status);
  revalidatePath("/admin/users");
};

export const setUserRoleAction = async (id: string, role: UserRole): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  await UpdateUser(tenantSlug, id, { role });
  revalidatePath("/admin/users");
};
