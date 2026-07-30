"use server";
import "server-only";

import { requireAdminContext } from "@/features/admin/admin-guard";
import {
  AddTagDimension,
  DeleteTagDimension,
  RenameTagDimension,
} from "@/features/admin/group-service";
import { revalidatePath } from "next/cache";

export const addTagDimensionAction = async (formData: FormData): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await AddTagDimension(tenantSlug, name);
  revalidatePath("/admin/groups");
};

export const renameTagDimensionAction = async (
  oldName: string,
  formData: FormData
): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  const newName = String(formData.get("newName") ?? "").trim();
  if (!newName) return;

  await RenameTagDimension(tenantSlug, oldName, newName);
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
};

export const deleteTagDimensionAction = async (name: string): Promise<void> => {
  const { tenantSlug } = await requireAdminContext();
  await DeleteTagDimension(tenantSlug, name);
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
};
