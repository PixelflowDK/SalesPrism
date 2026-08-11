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
import { EXTENSION_ATTRIBUTE } from "@/features/extensions-page/extension-services/models";
import { PERSONA_ATTRIBUTE } from "@/features/persona-page/persona-services/models";
import { PROMPT_ATTRIBUTE } from "@/features/prompt-page/models";
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
 * subject's ADR-003 canonical id (`${tenantId}:${oid}`):
 *   - CHAT_THREAD / CHAT_MESSAGE / CHAT_DOCUMENT / CHAT_CITATION
 *     (`HistoryContainer`, chat-services/models.ts) — scoped by `userId`.
 *   - SALES_COACH_CUSTOMER_ENTITY / SALES_COACH_MEETING_BRIEF
 *     (`ConfigContainer`, sales-coach/models.ts) — scoped by `ownerId`.
 *   - ACTIVITY_EVENT (`ConfigContainer`, admin/activity-service.ts) —
 *     scoped by `actorId`. (Also covered by a 30-day TTL —
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
 *   - PERSONA / EXTENSION (`HistoryContainer`, upstream azurechat) — scoped
 *     by `userId`, the partition key.
 *   - PROMPT (`ConfigContainer`, upstream azurechat) — scoped by `userId`,
 *     which for THIS type is the partition key itself, not a field beside a
 *     `tenantSlug` partition. See `eraseConfigDocsByUserPartition`.
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
  // SR-013 — three document types inherited from upstream azurechat that this
  // registry missed for its entire existence. All three are written keyed to
  // `currentUserId()` from live, reachable pages (/prompt, /persona,
  // /extensions), so they are unambiguously the data subject's personal data.
  //
  // `PROMPT` was the worst of the three: it lives in `ConfigContainer`, whose
  // `defaultTtl` is -1, so those documents were retained forever with no
  // erasure path at all — an Art. 17 and an Art. 5(1)(e) problem at once.
  // `PERSONA`/`EXTENSION` live in `HistoryContainer` and were being swept by
  // its 90-day chat TTL, which meant they eventually vanished but could not be
  // erased on request, and vanished for reasons nobody had designed.
  //
  // Note the side effect, which is correct but worth stating: a PUBLISHED
  // persona or extension is erased along with its author. Art. 17 is about the
  // author's data, and there is no basis for retaining it because colleagues
  // found it useful. Tenants who need a shared persona to survive its author
  // should own it under an admin/service account.
  prompts: PROMPT_ATTRIBUTE,
  personas: PERSONA_ATTRIBUTE,
  extensions: EXTENSION_ATTRIBUTE,
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
  prompts: number;
  personas: number;
  extensions: number;
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
  /** ADR-003 canonical id (`${tenantId}:${oid}`) of the admin who triggered the erasure — never the raw email/name. */
  performedById: z.string(),
  /** ADR-003 canonical id of the erased data subject, or the literal string `"never-logged-in"` for a pre-provisioned account that never signed in (see `EraseDataSubject`) — never the raw email/name. This audit record contains NO OTHER PII. */
  subjectId: z.string(),
  timestamp: z.string(),
  counts: z.object({
    chatThreads: z.number().int().nonnegative(),
    chatMessages: z.number().int().nonnegative(),
    chatDocuments: z.number().int().nonnegative(),
    chatCitations: z.number().int().nonnegative(),
    customerEntities: z.number().int().nonnegative(),
    meetingBriefs: z.number().int().nonnegative(),
    activityEvents: z.number().int().nonnegative(),
    prompts: z.number().int().nonnegative(),
    personas: z.number().int().nonnegative(),
    extensions: z.number().int().nonnegative(),
    searchIndexDocuments: z.number().int().nonnegative(),
    blobs: z.number().int().nonnegative(),
    userAccount: z.enum(["anonymized", "error"]),
  }),
});
export type GdprErasureAuditRecord = z.infer<typeof GdprErasureAuditRecordSchema>;

/** Deletes every `HistoryContainer` document of `type` owned by `subjectId` (the container's partition key). */
const eraseHistoryDocsByType = async (
  type: string,
  subjectId: string
): Promise<number> => {
  const container = HistoryContainer();
  const querySpec: SqlQuerySpec = {
    query: "SELECT c.id FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: type },
      { name: "@userId", value: subjectId },
    ],
  };

  const { resources } = await container.items
    .query<{ id: string }>(querySpec, { partitionKey: subjectId })
    .fetchAll();

  let deleted = 0;
  for (const { id } of resources) {
    try {
      await container.item(id, subjectId).delete();
      deleted++;
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code === 404) continue; // already gone — not a failure
      safeLog.error("gdpr.erasure.history-delete-failed", { errorCode: String(code ?? "unknown") });
    }
  }
  return deleted;
};

/** Returns the ids of every `CHAT_THREAD` document owned by `subjectId` — used to resolve blob paths (keyed by threadId, not userId). */
const findThreadIdsForSubject = async (subjectId: string): Promise<string[]> => {
  const querySpec: SqlQuerySpec = {
    query: "SELECT c.id FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: CHAT_THREAD_ATTRIBUTE },
      { name: "@userId", value: subjectId },
    ],
  };
  const { resources } = await HistoryContainer()
    .items.query<{ id: string }>(querySpec, { partitionKey: subjectId })
    .fetchAll();
  return resources.map((r) => r.id);
};

/**
 * Deletes every `ConfigContainer` document of `type` whose partition key IS the
 * subject's canonical id.
 *
 * Distinct from `eraseConfigDocsByOwnerField` below, which partitions by
 * `tenantSlug` and filters on a separate owner field. `PROMPT` documents follow
 * the opposite convention — `prompt-service.ts` sets `userId` (the partition
 * key) directly to `currentUserId()`, so there is no `tenantSlug` field to
 * filter on. Using the tenant-partitioned helper for them would silently match
 * nothing and report `deleted: 0` as success, which is exactly the shape of
 * failure that let this type go unerased in the first place.
 */
const eraseConfigDocsByUserPartition = async (
  type: string,
  subjectId: string
): Promise<number> => {
  const container = ConfigContainer();
  const querySpec: SqlQuerySpec = {
    query: "SELECT c.id FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: type },
      { name: "@userId", value: subjectId },
    ],
  };

  const { resources } = await container.items
    .query<{ id: string }>(querySpec, { partitionKey: subjectId })
    .fetchAll();

  let deleted = 0;
  for (const { id } of resources) {
    try {
      await container.item(id, subjectId).delete();
      deleted++;
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code === 404) continue;
      safeLog.error("gdpr.erasure.config-delete-failed", { errorCode: String(code ?? "unknown") });
    }
  }
  return deleted;
};

/** Deletes every `ConfigContainer` document of `type`, in `tenantSlug`, whose `ownerFieldName` matches `subjectId`. Both tenantSlug AND the owner field are required — never drop either. */
const eraseConfigDocsByOwnerField = async (
  type: string,
  tenantSlug: string,
  ownerFieldName: "ownerId" | "actorId",
  subjectId: string
): Promise<number> => {
  const container = ConfigContainer();
  const querySpec: SqlQuerySpec = {
    query: `SELECT c.id FROM root c WHERE c.type=@type AND c.tenantSlug=@tenantSlug AND c.${ownerFieldName}=@subjectId`,
    parameters: [
      { name: "@type", value: type },
      { name: "@tenantSlug", value: tenantSlug },
      { name: "@subjectId", value: subjectId },
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
const eraseSearchIndexDocuments = async (subjectId: string): Promise<number> => {
  const results = await DeleteDocumentsByUser(subjectId);
  return results.filter((r) => r.status === "OK").length;
};

/**
 * SAD §32.3 `anonymizeUser` — strips PII from the `UserAccount` document
 * but keeps it (and its `id`/`canonicalUserId`, needed for the doc's own Cosmos
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
  // `canonicalUserId` is nullable (never-logged-in invitee, see
  // `EraseDataSubject`'s doc comment) — `subject.id` (the Cosmos doc id,
  // always non-null) is used as the anonymized-email disambiguator instead
  // whenever there is no canonical id to slice.
  const anonymizerSuffix = (subject.canonicalUserId ?? subject.id).slice(0, 16);
  const anonymized: UserAccount = {
    ...subject,
    displayName: "Erased user",
    email: `erased-${anonymizerSuffix}@erased.invalid`,
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
  performedById: string,
  subjectId: string,
  counts: ErasureCounts
): Promise<ServerActionResponse<GdprErasureAuditRecord>> => {
  const record: GdprErasureAuditRecord = {
    id: `gdpr-erasure-${uniqueId()}`,
    type: GDPR_ERASURE_AUDIT_ATTRIBUTE,
    userId: tenantSlug,
    tenantSlug,
    performedById,
    subjectId,
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
 * `tenantSlug` AND the subject's own canonical id (ADR-003) — see module
 * doc above for the full store inventory. `subjectUserId` is the
 * `UserAccount` document id (same identifier the `/admin/users/[id]` page
 * and its server actions already use — see `user-service.ts`'s
 * `userAccountDocId`), NOT the raw email or canonical id directly, so the
 * caller never has to compute/know it itself; this function resolves the
 * subject's `canonicalUserId` from the `UserAccount` doc, which is ALSO how
 * it guarantees tenant scoping — `FindUserById` is itself
 * tenant-partition-scoped and re-checks `tenantSlug` on the resource, so an
 * id belonging to another tenant (or a nonexistent one) returns `NOT_FOUND`
 * before anything is deleted.
 *
 * `canonicalUserId` is nullable (`user-service.ts`'s `CreateUser` "invite by
 * email" flow — ADR-003: an admin-pre-provisioned account has no real oid
 * until its first login). Such a subject cannot own any per-user document
 * anywhere in this app (every erasable store is keyed by a non-null
 * canonicalUserId), so per-store erasure is skipped entirely (all counts
 * `0`) and only the directory doc itself is anonymized — still a complete,
 * correct erasure for that subject.
 */
export const EraseDataSubject = async (params: {
  tenantSlug: string;
  subjectUserId: string;
  performedById: string;
}): Promise<ServerActionResponse<GdprErasureAuditRecord>> => {
  const { tenantSlug, subjectUserId, performedById } = params;

  const subjectResponse = await FindUserById(tenantSlug, subjectUserId);
  if (subjectResponse.status !== "OK") {
    return subjectResponse;
  }
  const subject = subjectResponse.response;
  const subjectId = subject.canonicalUserId;

  let chatThreads = 0;
  let chatMessages = 0;
  let chatDocuments = 0;
  let chatCitations = 0;
  let customerEntities = 0;
  let meetingBriefs = 0;
  let activityEvents = 0;
  let prompts = 0;
  let personas = 0;
  let extensions = 0;
  let searchIndexDocuments = 0;
  let blobs = 0;

  if (subjectId !== null) {
    const threadIds = await findThreadIdsForSubject(subjectId);

    [
      chatThreads,
      chatMessages,
      chatDocuments,
      chatCitations,
      customerEntities,
      meetingBriefs,
      activityEvents,
      prompts,
      personas,
      extensions,
      searchIndexDocuments,
      blobs,
    ] = await Promise.all([
      eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatThreads, subjectId),
      eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatMessages, subjectId),
      eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatDocuments, subjectId),
      eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatCitations, subjectId),
      eraseConfigDocsByOwnerField(
        ERASABLE_DOCUMENT_TYPES.customerEntities,
        tenantSlug,
        "ownerId",
        subjectId
      ),
      eraseConfigDocsByOwnerField(
        ERASABLE_DOCUMENT_TYPES.meetingBriefs,
        tenantSlug,
        "ownerId",
        subjectId
      ),
      eraseConfigDocsByOwnerField(
        ERASABLE_DOCUMENT_TYPES.activityEvents,
        tenantSlug,
        "actorId",
        subjectId
      ),
      eraseConfigDocsByUserPartition(ERASABLE_DOCUMENT_TYPES.prompts, subjectId),
      eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.personas, subjectId),
      eraseHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.extensions, subjectId),
      eraseSearchIndexDocuments(subjectId),
      eraseBlobsForThreads(threadIds),
    ]);
  }

  const userAccount = await anonymizeUserAccount(tenantSlug, subject);

  const counts: ErasureCounts = {
    chatThreads,
    chatMessages,
    chatDocuments,
    chatCitations,
    customerEntities,
    meetingBriefs,
    activityEvents,
    prompts,
    personas,
    extensions,
    searchIndexDocuments,
    blobs,
    userAccount,
  };

  // Audit `subjectId` — a never-logged-in invitee (`null`) is recorded as
  // the literal string "never-logged-in" rather than `null`/empty, so the
  // audit trail (`GdprErasureAuditRecordSchema.subjectId: z.string()`,
  // deliberately non-nullable — the audit log itself must always have a
  // meaningful, non-empty value) unambiguously distinguishes "this subject
  // never had a canonical id to begin with" from a lookup bug.
  return writeAuditRecord(tenantSlug, performedById, subjectId ?? "never-logged-in", counts);
};
