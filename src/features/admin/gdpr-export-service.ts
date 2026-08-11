import "server-only";

import { ServerActionResponse } from "@/features/common/server-action-response";
import { ConfigContainer, HistoryContainer } from "@/features/common/services/cosmos";
import { safeLog } from "@/features/common/services/safe-logger";
import { SqlQuerySpec } from "@azure/cosmos";
import {
  ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES,
  ERASABLE_DOCUMENT_TYPES,
} from "./gdpr-erasure-service";
import { FindUserById, UserAccount } from "./user-service";

/**
 * GDPR Art. 15 (right of access) / Art. 20 (data portability) — SAD v2.7
 * Phase D, "On-request dataeksport".
 *
 * ── Why this is the mirror image of gdpr-erasure-service.ts ──────────────
 *
 * These two services answer the same question from opposite directions:
 * erasure asks "what do we hold about this person that must go", access asks
 * "what do we hold about this person that they may see". If the answers
 * differ, at least one of them is a lie — and the dangerous direction is an
 * export that omits a store erasure covers, because it tells a data subject
 * we hold less about them than we do.
 *
 * So the store list here is NOT written out by hand. It is derived from
 * `ERASABLE_DOCUMENT_TYPES` + `ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES`, and
 * `gdpr-export-service.test.ts` asserts the derivation covers every entry.
 * SR-013 is the reason for that paranoia: the erasure registry missed three
 * document types for its entire existence, and the test meant to catch that
 * used a hand-maintained list which omitted exactly the same three. Two
 * hand-maintained lists do not check each other; they agree.
 *
 * ── Partitioning ────────────────────────────────────────────────────────
 *
 * Three conventions, all of which must be honoured or the export silently
 * returns nothing for a store and looks successful:
 *
 *   1. `HistoryContainer`, partition key = the subject's canonical id.
 *      CHAT_THREAD / CHAT_MESSAGE / CHAT_DOCUMENT / CHAT_CITATION /
 *      PERSONA / EXTENSION.
 *   2. `ConfigContainer`, partition key = tenantSlug, owner in a named field.
 *      SALES_COACH_CUSTOMER_ENTITY + SALES_COACH_MEETING_BRIEF (`ownerId`),
 *      ACTIVITY_EVENT (`actorId`).
 *   3. `ConfigContainer`, partition key = the subject's canonical id.
 *      PROMPT — `prompt-service.ts` sets `userId` directly to
 *      `currentUserId()`, so there is no `tenantSlug` field to filter on.
 *
 * ── Read-only ───────────────────────────────────────────────────────────
 *
 * Nothing in this file may delete, update or upsert. An access request must
 * never mutate the data it reports on — that would make the export itself a
 * processing event the subject did not ask for, and would corrupt the very
 * record they are entitled to see.
 */

/** A store that holds personal data but cannot be represented in a JSON export. */
export type ExcludedStore = {
  store: string;
  reason: string;
};

export type DataSubjectExport = {
  /** ADR-003 canonical id (`${tenantId}:${oid}`) of the subject. */
  subjectId: string | null;
  tenantSlug: string;
  generatedAt: string;
  /** The subject's own account record — exported, not erased (see the erasure service). */
  userAccount: UserAccount;
  /** Keyed by the SAME keys as `ERASABLE_DOCUMENT_TYPES`, so the two services stay comparable. */
  documents: Record<string, unknown[]>;
  counts: Record<string, number>;
  /** Named explicitly so an omission is a disclosed limitation, never a silent gap. */
  notIncluded: ExcludedStore[];
};

/**
 * Stores that genuinely cannot appear in a JSON export. Each is listed in the
 * export payload itself: a data subject is entitled to know that a store
 * exists even when its contents cannot be handed over in this format.
 */
const NOT_INCLUDED: ExcludedStore[] = [
  {
    store: "Azure AI Search index documents",
    reason:
      "Derived representations (text chunks and embedding vectors) of the uploaded documents, which are themselves listed under chatDocuments. Exporting the derivations would duplicate the source without adding information the subject does not already have.",
  },
  {
    store: "Blob storage (chat image uploads)",
    reason:
      "Binary image data, not JSON-serialisable. Each image is referenced by its `chatThreadId/fileName` path in the corresponding chat message, and the files themselves can be provided separately on request.",
  },
  {
    store: "Application Insights telemetry",
    reason:
      "Operational logs restricted to allow-listed non-content fields (see safe-logger.ts). Retained 30 days and not organised by data subject.",
  },
];

/** Reads every `HistoryContainer` document of `type` owned by `subjectId` (the partition key). */
const readHistoryDocsByType = async (
  type: string,
  subjectId: string
): Promise<unknown[]> => {
  const querySpec: SqlQuerySpec = {
    query: "SELECT * FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: type },
      { name: "@userId", value: subjectId },
    ],
  };

  const { resources } = await HistoryContainer()
    .items.query<unknown>(querySpec, { partitionKey: subjectId })
    .fetchAll();

  return resources;
};

/** Reads every `ConfigContainer` document of `type` in `tenantSlug` whose `ownerFieldName` is `subjectId`. */
const readConfigDocsByOwnerField = async (
  type: string,
  tenantSlug: string,
  ownerFieldName: "ownerId" | "actorId",
  subjectId: string
): Promise<unknown[]> => {
  const querySpec: SqlQuerySpec = {
    query: `SELECT * FROM root c WHERE c.type=@type AND c.tenantSlug=@tenantSlug AND c.${ownerFieldName}=@subjectId`,
    parameters: [
      { name: "@type", value: type },
      { name: "@tenantSlug", value: tenantSlug },
      { name: "@subjectId", value: subjectId },
    ],
  };

  const { resources } = await ConfigContainer()
    .items.query<unknown>(querySpec, { partitionKey: tenantSlug })
    .fetchAll();

  return resources;
};

/** Reads every `ConfigContainer` document of `type` whose partition key IS the subject's canonical id. */
const readConfigDocsByUserPartition = async (
  type: string,
  subjectId: string
): Promise<unknown[]> => {
  const querySpec: SqlQuerySpec = {
    query: "SELECT * FROM root c WHERE c.type=@type AND c.userId=@userId",
    parameters: [
      { name: "@type", value: type },
      { name: "@userId", value: subjectId },
    ],
  };

  const { resources } = await ConfigContainer()
    .items.query<unknown>(querySpec, { partitionKey: subjectId })
    .fetchAll();

  return resources;
};

/**
 * How each erasable store is read back.
 *
 * Keys MUST match `ERASABLE_DOCUMENT_TYPES` exactly — the test asserts this,
 * so adding a store to the erasure registry without adding it here is a build
 * failure rather than a quietly incomplete export.
 */
const READERS: Record<
  keyof typeof ERASABLE_DOCUMENT_TYPES,
  (subjectId: string, tenantSlug: string) => Promise<unknown[]>
> = {
  chatThreads: (s) => readHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatThreads, s),
  chatMessages: (s) => readHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatMessages, s),
  chatDocuments: (s) => readHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatDocuments, s),
  chatCitations: (s) => readHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.chatCitations, s),
  personas: (s) => readHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.personas, s),
  extensions: (s) => readHistoryDocsByType(ERASABLE_DOCUMENT_TYPES.extensions, s),
  customerEntities: (s, t) =>
    readConfigDocsByOwnerField(ERASABLE_DOCUMENT_TYPES.customerEntities, t, "ownerId", s),
  meetingBriefs: (s, t) =>
    readConfigDocsByOwnerField(ERASABLE_DOCUMENT_TYPES.meetingBriefs, t, "ownerId", s),
  activityEvents: (s, t) =>
    readConfigDocsByOwnerField(ERASABLE_DOCUMENT_TYPES.activityEvents, t, "actorId", s),
  prompts: (s) => readConfigDocsByUserPartition(ERASABLE_DOCUMENT_TYPES.prompts, s),
};

/**
 * Assembles everything held about one data subject, for Art. 15 / Art. 20.
 *
 * `subjectUserId` is the `UserAccount` document id — the same identifier the
 * admin UI and the erasure route already use — never a raw email.
 *
 * A subject who has never signed in has no canonical id, so there are no
 * owned documents to find. That is a legitimate, complete export of an empty
 * set (their account record still exists and is included), not an error.
 */
export const ExportDataSubject = async (params: {
  tenantSlug: string;
  subjectUserId: string;
  performedById: string;
}): Promise<ServerActionResponse<DataSubjectExport>> => {
  const { tenantSlug, subjectUserId } = params;

  // Tenant-partition-scoped: a userId from another tenant returns NOT_FOUND
  // with nothing read, exactly as it does for erasure.
  const subjectResponse = await FindUserById(tenantSlug, subjectUserId);
  if (subjectResponse.status !== "OK") {
    return subjectResponse;
  }
  const subject = subjectResponse.response;
  const subjectId = subject.canonicalUserId;

  const documents: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  if (subjectId !== null) {
    const keys = Object.keys(READERS) as Array<keyof typeof READERS>;
    const results = await Promise.all(
      keys.map((key) => READERS[key](subjectId, tenantSlug))
    );
    keys.forEach((key, i) => {
      documents[key] = results[i];
      counts[key] = results[i].length;
    });
  } else {
    for (const key of Object.keys(READERS)) {
      documents[key] = [];
      counts[key] = 0;
    }
  }

  safeLog.info("gdpr.export.completed", {
    tenantSlug,
    userId: subjectId ?? undefined,
    count: Object.values(counts).reduce((a, b) => a + b, 0),
  });

  return {
    status: "OK",
    response: {
      subjectId,
      tenantSlug,
      generatedAt: new Date().toISOString(),
      userAccount: subject,
      documents,
      counts,
      notIncluded: NOT_INCLUDED,
    },
  };
};

/**
 * Exposed for the coverage test: the set of erasure-registry keys this service
 * knows how to read. Kept as a real export rather than reaching into `READERS`
 * from the test, so the test asserts on a published contract.
 */
export const EXPORTED_STORE_KEYS = Object.keys(READERS);

/** The one store handled outside `READERS`, exported so the test can prove nothing is missed. */
export const EXPORTED_ANONYMIZED_STORE_KEYS = Object.keys(
  ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES
);
