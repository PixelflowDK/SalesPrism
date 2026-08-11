"use server";
import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import { safeLog } from "@/features/common/services/safe-logger";
import { revalidatePath } from "next/cache";
import { EnsureModuleConfig, UpdateModuleConfig } from "../context-injection";
import { ModuleKeySchema } from "../models";

/**
 * W4 — `/admin/modules` save action (SAD §27.3 per-tenant enable/disable).
 * Re-derives `tenantSlug` from the authenticated admin session
 * (`requireAdminContext`, never a client-supplied value) and preserves each
 * module's existing `order`/`customName` — this form only ever changes
 * `active`.
 */
export const updateModuleConfigAction = async (formData: FormData): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();

  const existing = await EnsureModuleConfig(tenantSlug);
  if (existing.status !== "OK") {
    safeLog.warn("sales-coach.module-config.admin-load-rejected", { tenantSlug });
    throw new Error(existing.errors[0]?.message ?? "Unable to load module configuration.");
  }

  const activeKeys = new Set(
    formData
      .getAll("activeModules")
      .map(String)
      .filter((v) => ModuleKeySchema.safeParse(v).success)
  );

  const entries = existing.response.modules.map((m) => ({
    key: m.key,
    active: activeKeys.has(m.key),
    order: m.order,
    customName: m.customName,
  }));

  const result = await UpdateModuleConfig(tenantSlug, entries);
  if (result.status !== "OK") {
    safeLog.warn("sales-coach.module-config.admin-update-rejected", { tenantSlug });
    throw new Error(result.errors[0]?.message ?? "Unable to update module configuration.");
  }

  revalidatePath("/admin/modules");
  revalidatePath("/modules");
};
