import "server-only";

import { ServerActionResponse } from "@/features/common/server-action-response";
import { ConfigContainer, HistoryContainer } from "@/features/common/services/cosmos";
import { DeleteBlobsWithPrefix } from "@/features/common/services/azure-storage";
import { safeLog } from "@/features/common/services/safe-logger";
import { uniqueId } from "@/features/common/util";
import { DeleteDocumentsByUser } from "@/features/chat-page/chat-services/azure-ai-search/azure-ai-search";
import { IMAGE_CONTAINER_NAME } from "@/features/chat-page/chat-services/chat-image-service";
import {
  CHAT_CITATION_ATTRIBUTE,
  CHAT_DOCUMENT_ATTRIBUTE,
  CHAT_THREAD_ATTRIBUTE,
  MESSAGE_ATTRIBUTE,
} from "@/features/chat-page/chat-services/models";
import {
  CUSTOMER_ENTITY_ATTRIBUTE,
  MEETING_BRIEF_ATTRIBUTE,
  MODULE_CONFIG_ATTRIBUTE,
} from "@/features/sales-coach/models";
import { TAG_DIMENSIONS_ATTRIBUTE } from "@/features/admin/group-service";
import { TENANT_THEME_ATTRIBUTE } from "@/features/theme/tenant-theme";
import { SqlQuerySpec } from "@azure/cosmos";
import { z } from "zod";
import {
  ACTIVITY_EVENT_ATTRIBUTE,
} from "./activity-service";
import { FindUserById, UserAccount, UserAccountSchema, USER_ACCOUNT_ATTRIBUTE } from "./user-service";

/**
 * GDPR erasure ("forget data subject X") — SAD v2.7 §32.3, Codex review #2
 * finding 3 (HIGH — no erasure path existed for any of the new Sales Coach
 * / admin containers), security-gdpr-review H-4.
 *
 * ── Store inventory (every Cosmos/AI-Search/Storage write path in this
 * repo, as of this file's introduction) ──────────────────────────────────
 *
 * ERASABLE_DOCUMENT_TYPES — hard-deleted, scoped by tenantSlug AND the
 * subject's hashed id:
 *   - CHAT_THREAD / CHAT_MESSAGE / CHAT_DOCUMENT / CHAT_CITATION
 *     (`HistoryContainer`, chat-services/models.ts) — scoped by `userId`.
 *   - SALES_COACH_CUSTOMER_ENTITY / SALES_COACH_MEETING_BRIEF
 *     (`ConfigContainer`, sales-coach/models.ts) — scoped by `ownerHashedId`.
 *   - ACTIVITY_EVENT (`ConfigContainer`, admin/activity-service.ts) —
 *     scoped by `actorHashedId`. (Also covered by a 30-day TTL —
 *     see cosmos-retention.ts — this makes Art. 17 immediate rather than
 *     waiting up to 30 days.)
 *   - AI Search index documents — scoped by the `user` field, the SAME
 *     hashed id `rag-tool.ts`'s RAG filter uses. See
 *     `DeleteDocumentsByUser`'s doc comment for why this is NOT the
 *     un-erasable "anonymized embedding" SAD §32.3 describes — that
 *     assumption does not hold for this implementation (see below).
 *   - Blob storage — the `images` container's multimodal chat-image blobs,
 *     keyed by `${chatThreadId}/${fileName}` (no user id in the blob path),
 *     resolved via the subject's own chat-thread ids.
 *
 * ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES — kept for audit, PII stripped:
 *   - USER_ACCOUNT (`ConfigContainer`, admin/user-service.ts) — per SAD
 *     §32.3's `eraseUser`/`anonymizeUser` split. Onboarding state
 *     (`onboardingCompletedAt`) is a field on this same document, not a
 *     separate store — it is intentionally left as-is (not PII).
 *
 * TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES — deliberately NOT touched by
 * per-subject erasure, because no single data subject owns them:
 *   - TENANT_THEME_CONFIG, SALES_COACH_MODULE_CONFIG, TAG_DIMENSIONS —
 *     tenant-wide configuration singletons.
 *   - GDPR_ERASURE_AUDIT (this file) — the audit trail must outlive any
 *     erasure it records.
 *
 * `gdpr-erasure-service.test.ts` asserts these three registries' `type`
 * values cover EXACTLY the full set of `*_ATTRIBUTE` constants exported by
 * every model file above — so a document type added to any of those files
 * without being classified into one of the three registries fails that
 * test, per this task's "parametrize so a newly-added store without
 * erasure coverage fails the test" requirement.
 *
 * ── On SAD §32.3's "embeddings cannot be deleted per user" claim ────────
 * SAD §32.3 asserts AI Search embeddings are "anonymized document
 * representations" that cannot be erased per subject. Verified false for
 * this implementation: `azure-ai-search.ts`'s index schema stores the
 * `embedding` vector, the full extracted `pageContent` text, AND the
 * `user`/`chatThreadId` hashed identifiers in the SAME index document (see
 * `EnsureIndexIsCreated`'s field list) — nothing here is anonymized, and
 * nothing is split into a separate embedding-only store. Deleting the
 * index document by `user` filter removes vector, text, and identity tag
 * together. There is no irreversibly-derived, un-erasable remnant left
 * behind in this codebase today.
 *
 * ── Not implemented (see docs/known-limitations.md) ──────────────────────
 *   - SAD §32.3 step 3, "Slet bruger fra Entra External ID": no Graph API
 *     client exists anywhere in this repo, and `src/features/auth-page/`
 *     is read-only for this task. See known-limitations.md for why this
 *     should likely be corrected in the SAD rather than implemented
 *     blindly (the SSO identity for `entra-sso` tenants lives in the
 *     CUSTOMER's own Entra tenant, not one this app has Graph permissions
 *     against).
 *   - Cosmos continuous-backup / AI Search platform-level snapshots are
 *     outside this app's control and are not purged by this flow — normal
 *     for any cloud data store's live-API-vs-backup distinction.
 */

export const GDPR_ERASURE_AUDIT_ATTRIBUTE = "GDPR_ERASURE_AUDIT";

export const ERASABLE_DOCUMENT_TYPES = {
  chatThreads: CHAT_THREAD_ATTRIBUTE,
  chatMessages: MESSAGE_ATTRIBUTE,
  chatDocuments: CHAT_DOCUMENT_ATTRIBUTE,
  chatCitations: CHAT_CITATION_ATTRIBUTE,
  customerEntities: CUSTOMER_ENTITY_ATTRIBUTE,
  meetingBriefs: MEETING_BRIEF_ATTRIBUTE,
  activityEvents: ACTIVITY_EVENT_ATTRIBUTE,
} as const;

export const ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES = {
  userAccount: USER_ACCOUNT_ATTRIBUTE,
} as const;

export const TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES = {
  tenantTheme: TENANT_THEME_ATTRIBUTE,
  moduleConfig: MODULE_CONFIG_ATTRIBUTE,
  tagDimensions: TAG_DIMENSIONS_ATTRIBUTE,
  gdprErasureAudit: GDPR_ERASURE_AUDIT_ATTRIBUTE,
} as const;

export type ErasureCounts = {
  chatThreads: number;
  chatMessages: number;
  chatDocuments: number;
  chatCitations: number;
  customerEntities: number;
  meetingBriefs: number;
  activityEvents: number;
  searchIndexDocuments: number;
  blobs: number;
  userAccount: "anonymized" | "error";
};

export const GdprErasureAuditRecordSchema = z.object({
  id: z.string(),
  type: z.literal(GDPR_ERASURE_AUDIT_ATTRIBUTE),
  /** Cosmos partition key — set to `tenantSlug`, same convention as every other `ConfigContainer` document. */
  userId: z.string(),
  tenantSlug: z.string(),
  /** SHA-256 hash of the admin who triggered the erasure — never the raw email/name. */
  performedByHashedId: z.string(),
  /** SHA-256 hash of the erased data subject — never the raw email/name. This audit record contains NO OTHER PII. */
  subjectHashedId: z.string(),
  timestamp: z.string(),
  counts: z.object({
    chatThreads: z.number().int().nonnegative(),
    chatMessages: z.number().int().nonnegative(),
    chatDocuments: z.number().int().nonnegative(),
    chatCitations: z.number().int().nonnegative(),
    customerEntities: z.number().int().nonnegative(),
    meetingBriefs: z.number().int().nonnegative(),
    activityEvents: z.number().int().nonnegative(),
    searchIndexDocuments: z.number().int().nonnegative(),
    blobs: z.number().int().nonnegative(),
    userAccount: z.enum(["anonymized", "error"]),
  }),
});
export type GdprErasureAuditRecord = z.infer<typeof GdprErasureAuditRecordSchema>;

/** Deletes every `HistoryContainer` document of `type` owned by `subjectHashedId` (the container's partition key). */
const eraseHistoryDocsByType = async (
  type: string,
  subjectHashedId: string
): Promise<number> => {
  const container = HistoryContainer();
  const querySpec: SqlQuerySpec = {
    query: "SELECT c.id FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: type },
      { name: "@userId", value: subjectHashedId },
    ],
  };

  const { resources } = await container.items
    .query<{ id: string }>(querySpec, { partitionKey: subjectHashedId })
    .fetchAll();

  let deleted = 0;
  for (const { id } of resources) {
    try {
      await container.item(id, subjectHashedId).delete();
      deleted++;
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code === 404) continue; // already gone — not a failure
      safeLog.error("gdpr.erasure.history-delete-failed", { errorCode: String(code ?? "unknown") });
    }
  }
  return deleted;
};

/** Returns the ids of every `CHAT_THREAD` document owned by `subjectHashedId` — used to resolve blob paths (keyed by threadId, not userId). */
const findThreadIdsForSubject = async (subjectHashedId: string): Promise<string[]> => {
  const querySpec: SqlQuerySpec = {
    query: "SELECT c.id FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: CHAT_THREAD_ATTRIBUTE },
      { name: "@userId", value: subjectHashedId },
    ],
  };
  const { resources } = await HistoryContainer()
    .items.query<{ id: string }>(querySpec, { partitionKey: subjectHashedId })
    .fetchAll();
  return resources.map((r) => r.id);
};

/** Deletes every `ConfigContainer` document of `type`, in `tenantSlug`, whose `ownerFieldName` matches `subjectHashedId`. Both tenantSlug AND the owner field are required — never drop either. */
const eraseConfigDocsByOwnerField = async (
  type: string,
  tenantSlug: string,
  ownerFieldName: "ownerHashedId" | "actorHashedId",
  subjectHashedId: string
): Promise<number> => {
  const container = ConfigContainer();
  const querySpec: SqlQuerySpec = {
    query: `SELECT c.id FROM root c WHERE c.type=@type AND c.tenantSlug=@tenantSlug AND c.${ownerFieldName}=@subjectHashedId`,
    parameters: [
      { name: "@type", value: type },
      { name: "@tenantSlug", value: tenantSlug },
      { name: "@subjectHashedId", value: subjectHashedId },
    ],
  };

  const { resources } = await container.items
    .query<{ id: string }>(querySpec, { partitionKey: tenantSlug })
    .fetchAll();

  let deleted = 0;
  for (const { id } of resources) {
    try {
      await container.item(id, tenantSlug).delete();
      deleted++;
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code === 404) continue;
      safeLog.error("gdpr.erasure.config-delete-failed", { errorCode: String(code ?? "unknown") });
    }
  }
  return deleted;
};

/** Deletes every image blob belonging to the subject's own chat threads. */
const eraseBlobsForThreads = async (threadIds: string[]): Promise<number> => {
  let deleted = 0;
  for (const threadId of threadIds) {
    const result = await DeleteBlobsWithPrefix(IMAGE_CONTAINER_NAME, `${threadId}/`);
    if (result.status === "OK") {
      deleted += result.response;
    } else {
      safeLog.error("gdpr.erasure.blob-delete-failed");
    }
  }
  return deleted;
};

/** Deletes every AI Search index document tagged with the subject's hashed id. */
const eraseSearchIndexDocuments = async (subjectHashedId: string): Promise<number> => {
  const results = await DeleteDocumentsByUser(subjectHashedId);
  return results.filter((r) => r.status === "OK").length;
};

/**
 * SAD §32.3 `anonymizeUser` — strips PII from the `UserAccount` document
 * but keeps it (and its `id`/`hashedId`, needed for the doc's own Cosmos
 * identity and for admin-side lookups) for audit purposes, rather than
 * hard-deleting it. `status: "disabled"` is set as defense-in-depth,
 * though see docs/known-limitations.md: this app does not currently
 * enforce `UserAccount.status` at authentication (pre-existing gap,
 * outside this task's `auth-page/` read-only boundary) — a re-authenticated
 * subject's `EnsureUserOnLogin` will re-sync `displayName`/`email` from the
 * IdP onto this SAME document on next login unless the IdP-side identity is
 * also removed/disabled (SAD §32.3 step 3, not implemented — see module
 * doc above).
 */
const anonymizeUserAccount = async (
  tenantSlug: string,
  subject: UserAccount
): Promise<"anonymized" | "error"> => {
  const anonymized: UserAccount = {
    ...subject,
    displayName: "Erased user",
    email: `erased-${subject.hashedId.slice(0, 16)}@erased.invalid`,
    tags: {},
    lastLoginAt: null,
    status: "disabled",
  };

  const parsed = UserAccountSchema.safeParse(anonymized);
  if (!parsed.success) {
    safeLog.error("gdpr.erasure.anonymize-validation-failed", { tenantSlug });
    return "error";
  }

  try {
    await ConfigContainer().items.upsert<UserAccount>(parsed.data);
    return "anonymized";
  } catch {
    safeLog.error("gdpr.erasure.anonymize-failed", { tenantSlug });
    return "error";
  }
};

const writeAuditRecord = async (
  tenantSlug: string,
  performedByHashedId: string,
  subjectHashedId: string,
  counts: ErasureCounts
): Promise<ServerActionResponse<GdprErasureAuditRecord>> => {
  const record: GdprErasureAuditRecord = {
    id: `gdpr-erasure-${uniqueId()}`,
    type: GDPR_ERASURE_AUDIT_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    performedByHashedId,
    subjectHashedId,
    timestamp: new Date().toISOString(),
    counts,
  };

  const parsed = GdprErasureAuditRecordSchema.safeParse(record);
  if (!parsed.success) {
    safeLog.error("gdpr.erasure.audit-validation-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to record erasure audit entry." }] };
  }

  try {
    const { resource } = await ConfigContainer().items.create<GdprErasureAuditRecord>(parsed.data);
    if (!resource) {
      return { status: "ERROR", errors: [{ message: "Unable to record erasure audit entry." }] };
    }
    return { status: "OK", response: resource };
  } catch {
    safeLog.error("gdpr.erasure.audit-write-failed", { tenantSlug });
    return { status: "ERROR", errors: [{ message: "Unable to record erasure audit entry." }] };
  }
};

/**
 * Erases every store's data for a single data subject, scoped to
 * `tenantSlug` AND the subject's own hashed id — see module doc above for
 * the full store inventory. `subjectUserId` is the `UserAccount` document
 * id (same identifier the `/admin/users/[id]` page and its server actions
 * already use — see `user-service.ts`'s `userAccountDocId`), NOT the raw
 * email or hashed id directly, so the caller never has to compute the hash
 * itself; this function resolves the subject's `hashedId` from the
 * `UserAccount` doc, which is ALSO how it guarantees tenant scoping —
 * `FindUserById` is itself tenant-partition-scoped and re-checks
 * `tenantSlug` on the resource, so an id belonging to another tenant (or a
 * nonexistent one) returns `NOT_FOUND` before anything is deleted.
 */
export const EraseDataSubject = async (params: {
  tenantSlug: string;
  subjectUserId: string;
  performedByHashedId: string;
}): Promise<ServerActionResponse<GdprErasureAuditRecord>> => {
  const { tenantSlug, subjectUserId, performedByHashedId } = params;

  const subjectResponse = await FindUserById(tenantSlug, subjectUserId);
  if (subjectResponse.status !== "OK") {
    return subjectResponse;
  }
  const subject = subjectResponse.response;
  const subjectHashedId = subject.hashedId;

  const threadIds = await findThreadIdsForSubject(subjectHashedId);

  const [
    chatThreads,
    chatMessages,
    chatDocuments,
    chatCitations,
    customerEntities,
    meetingBriefs,
    activityEvents,
    searchIndexDocuments,
    blobs,
    userAccount,
  ] = await Promise.all([
    eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatThreads, subjectHashedId),
    eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatMessages, subjectHashedId),
    eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatDocuments, subjectHashedId),
    eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatCitations, subjectHashedId),
    eraseConfigDocsByOwnerField(
      ERASABLE_DOCUMENT_TYPES.customerEntities,
      tenantSlug,
      "ownerHashedId",
      subjectHashedId
    ),
    eraseConfigDocsByOwnerField(
      ERASABLE_DOCUMENT_TYPES.meetingBriefs,
      tenantSlug,
      "ownerHashedId",
      subjectHashedId
    ),
    eraseConfigDocsByOwnerField(
      ERASABLE_DOCUMENT_TYPES.activityEvents,
      tenantSlug,
      "actorHashedId",
      subjectHashedId
    ),
    eraseSearchIndexDocuments(subjectHashedId),
    eraseBlobsForThreads(threadIds),
    anonymizeUserAccount(tenantSlug, subject),
  ]);

  const counts: ErasureCounts = {
    chatThreads,
    chatMessages,
    chatDocuments,
    chatCitations,
    customerEntities,
    meetingBriefs,
    activityEvents,
    searchIndexDocuments,
    blobs,
    userAccount,
  };

  return writeAuditRecord(tenantSlug, performedByHashedId, subjectHashedId, counts);
};
