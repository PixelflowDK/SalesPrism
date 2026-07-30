import "server-only";

import {
  ServerActionResponse,
  zodErrorsToServerActionErrors,
} from "@/features/common/server-action-response";
import { ConfigContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { z } from "zod";
import { FindUsersForTenant, UserAccount } from "./user-service";

/**
 * Tag-dimension registry — SAD v2.7 §8.4/§8.6.
 *
 * `UserAccount.tags` is a free-form `Record<string,string>` (each customer
 * defines their own dimensions, e.g. `{ land, by, afdeling }` for DSV). That
 * alone lets an admin filter/report on whatever keys happen to exist on
 * users today, but gives no way to (a) create a new dimension before any
 * user has it, or (b) rename/delete a dimension across every user in one
 * action. This document tracks the tenant's known dimension names
 * explicitly, in the same `ConfigContainer` / tenantSlug-partition
 * convention as `UserAccount` and `TenantTheme`.
 */
export const TAG_DIMENSIONS_ATTRIBUTE = "TAG_DIMENSIONS";

export const TagDimensionsSchema = z.object({
  id: z.string(),
  type: z.literal(TAG_DIMENSIONS_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`. */
  userId: z.string(),
  tenantSlug: z.string(),
  dimensions: z.array(z.string()),
  updatedAt: z.string(),
});
export type TagDimensions = z.infer<typeof TagDimensionsSchema>;

const tagDimensionsDocId = (tenantSlug: string) => `tag-dimensions-${tenantSlug}`;

export const GetTagDimensions = async (
  tenantSlug: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const { resource } = await ConfigContainer()
      .item(tagDimensionsDocId(tenantSlug), tenantSlug)
      .read<TagDimensions>();

    if (!resource) {
      return {
        status: "OK",
        response: {
          id: tagDimensionsDocId(tenantSlug),
          type: TAG_DIMENSIONS_ATTRIBUTE,
          userId: tenantSlug,
          tenantSlug,
          dimensions: [],
          updatedAt: new Date(0).toISOString(),
        },
      };
    }

    const parsed = TagDimensionsSchema.safeParse(resource);
    if (!parsed.success) {
      return {
        status: "ERROR",
        errors: zodErrorsToServerActionErrors(parsed.error.errors),
      };
    }
    return { status: "OK", response: parsed.data };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 404) {
      return {
        status: "OK",
        response: {
          id: tagDimensionsDocId(tenantSlug),
          type: TAG_DIMENSIONS_ATTRIBUTE,
          userId: tenantSlug,
          tenantSlug,
          dimensions: [],
          updatedAt: new Date(0).toISOString(),
        },
      };
    }
    safeLog.error("admin.groups.get-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to load tag dimensions." }] };
  }
};

const upsertDimensions = async (
  tenantSlug: string,
  dimensions: string[]
): Promise<ServerActionResponse<TagDimensions>> => {
  const model: TagDimensions = {
    id: tagDimensionsDocId(tenantSlug),
    type: TAG_DIMENSIONS_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    dimensions: Array.from(new Set(dimensions)).filter((d) => d.trim().length > 0),
    updatedAt: new Date().toISOString(),
  };

  const { resource } = await ConfigContainer().items.upsert<TagDimensions>(model);
  if (!resource) {
    return { status: "ERROR", errors: [{ message: "Unable to save tag dimensions." }] };
  }
  return { status: "OK", response: resource };
};

export const AddTagDimension = async (
  tenantSlug: string,
  name: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { status: "ERROR", errors: [{ message: "Dimension name cannot be empty." }] };
    }

    const existing = await GetTagDimensions(tenantSlug);
    if (existing.status !== "OK") return existing;

    return await upsertDimensions(tenantSlug, [...existing.response.dimensions, trimmed]);
  } catch (error) {
    safeLog.error("admin.groups.add-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to add tag dimension." }] };
  }
};

/** Renames a dimension: updates the registry AND every user's `tags` key across the tenant. */
export const RenameTagDimension = async (
  tenantSlug: string,
  oldName: string,
  newName: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const trimmedNew = newName.trim();
    if (trimmedNew.length === 0) {
      return { status: "ERROR", errors: [{ message: "Dimension name cannot be empty." }] };
    }

    const existing = await GetTagDimensions(tenantSlug);
    if (existing.status !== "OK") return existing;

    const renamed = existing.response.dimensions.map((d) => (d === oldName ? trimmedNew : d));
    const dimensionsResult = await upsertDimensions(tenantSlug, renamed);
    if (dimensionsResult.status !== "OK") return dimensionsResult;

    await rewriteTagKeyOnAllUsers(tenantSlug, oldName, trimmedNew);
    return dimensionsResult;
  } catch (error) {
    safeLog.error("admin.groups.rename-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to rename tag dimension." }] };
  }
};

/** Deletes a dimension: removes it from the registry AND every user's `tags`. */
export const DeleteTagDimension = async (
  tenantSlug: string,
  name: string
): Promise<ServerActionResponse<TagDimensions>> => {
  try {
    const existing = await GetTagDimensions(tenantSlug);
    if (existing.status !== "OK") return existing;

    const remaining = existing.response.dimensions.filter((d) => d !== name);
    const dimensionsResult = await upsertDimensions(tenantSlug, remaining);
    if (dimensionsResult.status !== "OK") return dimensionsResult;

    await rewriteTagKeyOnAllUsers(tenantSlug, name, null);
    return dimensionsResult;
  } catch (error) {
    safeLog.error("admin.groups.delete-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to delete tag dimension." }] };
  }
};

/**
 * Renames (or, if `newKey` is `null`, deletes) a single tag key across
 * every `UserAccount` in the tenant. Best-effort per-user — one bad doc
 * does not abort the whole batch, since this can touch every user in the
 * tenant.
 */
const rewriteTagKeyOnAllUsers = async (
  tenantSlug: string,
  oldKey: string,
  newKey: string | null
): Promise<void> => {
  const usersResponse = await FindUsersForTenant(tenantSlug);
  if (usersResponse.status !== "OK") return;

  await Promise.all(
    usersResponse.response
      .filter((u) => Object.prototype.hasOwnProperty.call(u.tags, oldKey))
      .map(async (u) => {
        const { [oldKey]: value, ...rest } = u.tags;
        const nextTags = newKey ? { ...rest, [newKey]: value } : rest;
        const updated: UserAccount = { ...u, tags: nextTags };
        try {
          await ConfigContainer().items.upsert<UserAccount>(updated);
        } catch {
          safeLog.error("admin.groups.rewrite-user-tag-failed", { tenantSlug });
        }
      })
  );
};
