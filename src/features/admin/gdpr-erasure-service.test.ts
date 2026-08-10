import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-boundary mocks — no real Cosmos/AI Search/Storage calls. Both
// `HistoryContainer` and `ConfigContainer` route `.items.query()` results by
// the `@type` SQL parameter, so each store under test can be given its own
// canned result set in one shared mock.
// ---------------------------------------------------------------------------
const historyQueryMock = vi.fn();
const historyItemDeleteMock = vi.fn();
const historyItemMock = vi.fn(() => ({ delete: historyItemDeleteMock }));

const configQueryMock = vi.fn();
const configItemReadMock = vi.fn();
const configItemDeleteMock = vi.fn();
const configItemMock = vi.fn(() => ({
  read: configItemReadMock,
  delete: configItemDeleteMock,
}));
const configItemsCreateMock = vi.fn();
const configItemsUpsertMock = vi.fn();

vi.mock("@/features/common/services/cosmos", () => ({
  HistoryContainer: () => ({
    items: { query: historyQueryMock },
    item: historyItemMock,
  }),
  ConfigContainer: () => ({
    items: { query: configQueryMock, create: configItemsCreateMock, upsert: configItemsUpsertMock },
    item: configItemMock,
  }),
}));

const deleteBlobsWithPrefixMock = vi.fn();
vi.mock("@/features/common/services/azure-storage", () => ({
  DeleteBlobsWithPrefix: (containerName: string, prefix: string) =>
    deleteBlobsWithPrefixMock(containerName, prefix),
}));

const deleteDocumentsByUserMock = vi.fn();
vi.mock("@/features/chat-page/chat-services/azure-ai-search/azure-ai-search", () => ({
  DeleteDocumentsByUser: (userId: string) => deleteDocumentsByUserMock(userId),
}));

vi.mock("@/features/chat-page/chat-services/chat-image-service", () => ({
  IMAGE_CONTAINER_NAME: "images",
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/common/util", () => ({
  uniqueId: () => "fixed-audit-id",
}));

import {
  CHAT_CITATION_ATTRIBUTE,
  CHAT_DOCUMENT_ATTRIBUTE,
  CHAT_THREAD_ATTRIBUTE,
  MESSAGE_ATTRIBUTE,
} from "@/features/chat-page/chat-services/models";
import { ACTIVITY_EVENT_ATTRIBUTE } from "@/features/admin/activity-service";
import { TAG_DIMENSIONS_ATTRIBUTE } from "@/features/admin/group-service";
import { USER_ACCOUNT_ATTRIBUTE, UserAccount } from "@/features/admin/user-service";
import { CUSTOMER_ENTITY_ATTRIBUTE, MEETING_BRIEF_ATTRIBUTE, MODULE_CONFIG_ATTRIBUTE } from "@/features/sales-coach/models";
import { TENANT_THEME_ATTRIBUTE } from "@/features/theme/tenant-theme";
import {
  ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES,
  ERASABLE_DOCUMENT_TYPES,
  EraseDataSubject,
  GDPR_ERASURE_AUDIT_ATTRIBUTE,
  TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES,
} from "./gdpr-erasure-service";

const TENANT = "dsv";
const OTHER_TENANT = "atea";
const SUBJECT_HASHED_ID = "hashed-subject-abc123";
const ADMIN_HASHED_ID = "hashed-admin-xyz789";
const SUBJECT_USER_DOC_ID = `user-${TENANT}-${SUBJECT_HASHED_ID}`;

const buildSubjectUserAccount = (overrides: Partial<UserAccount> = {}): UserAccount => ({
  id: SUBJECT_USER_DOC_ID,
  type: USER_ACCOUNT_ATTRIBUTE,
  userId: TENANT,
  tenantSlug: TENANT,
  canonicalUserId: SUBJECT_HASHED_ID,
  displayName: "Real Seller Name",
  email: "real.seller@example.com",
  role: "user",
  authMethod: "username-password",
  tags: { land: "DK" },
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: "2026-07-01T00:00:00.000Z",
  status: "active",
  onboardingCompletedAt: null,
  ...overrides,
});

type QueryParam = { name: string; value: unknown };
type QuerySpec = { query: string; parameters: QueryParam[] };

const findParam = (spec: QuerySpec, name: string) =>
  spec.parameters.find((p) => p.name === name)?.value;

const makeTypedQueryMock = (resultsByType: Record<string, { id: string }[]>) =>
  vi.fn((querySpec: QuerySpec) => {
    const type = findParam(querySpec, "@type") as string;
    return { fetchAll: async () => ({ resources: resultsByType[type] ?? [] }) };
  });

describe("gdpr-erasure-service — store coverage registry (regression guard)", () => {
  it("classifies every known Cosmos document type into exactly one registry", () => {
    const allKnownTypes = new Set<string>([
      CHAT_THREAD_ATTRIBUTE,
      MESSAGE_ATTRIBUTE,
      CHAT_DOCUMENT_ATTRIBUTE,
      CHAT_CITATION_ATTRIBUTE,
      CUSTOMER_ENTITY_ATTRIBUTE,
      MEETING_BRIEF_ATTRIBUTE,
      MODULE_CONFIG_ATTRIBUTE,
      ACTIVITY_EVENT_ATTRIBUTE,
      TAG_DIMENSIONS_ATTRIBUTE,
      USER_ACCOUNT_ATTRIBUTE,
      TENANT_THEME_ATTRIBUTE,
      GDPR_ERASURE_AUDIT_ATTRIBUTE,
    ]);

    const coveredTypes = new Set<string>([
      ...Object.values(ERASABLE_DOCUMENT_TYPES),
      ...Object.values(ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES),
      ...Object.values(TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES),
    ]);

    expect(Array.from(coveredTypes).sort()).toEqual(Array.from(allKnownTypes).sort());
  });

  it("regression guard: a hypothetical new, unclassified document type is NOT covered — this is exactly what would fail if a real one were added without updating this file", () => {
    const coveredTypes = new Set<string>([
      ...Object.values(ERASABLE_DOCUMENT_TYPES),
      ...Object.values(ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES),
      ...Object.values(TENANT_LEVEL_EXCLUDED_DOCUMENT_TYPES),
    ]);

    expect(coveredTypes.has("SOME_NEW_DOCUMENT_TYPE_NOBODY_CLASSIFIED")).toBe(false);
  });
});

describe("EraseDataSubject", () => {
  beforeEach(() => {
    historyQueryMock.mockReset();
    historyItemDeleteMock.mockReset();
    historyItemMock.mockClear();
    configQueryMock.mockReset();
    configItemReadMock.mockReset();
    configItemDeleteMock.mockReset();
    configItemMock.mockClear();
    configItemsCreateMock.mockReset();
    configItemsUpsertMock.mockReset();
    deleteBlobsWithPrefixMock.mockReset();
    deleteDocumentsByUserMock.mockReset();

    historyQueryMock.mockImplementation(
      makeTypedQueryMock({
        [CHAT_THREAD_ATTRIBUTE]: [{ id: "thread-1" }, { id: "thread-2" }],
        [MESSAGE_ATTRIBUTE]: [{ id: "msg-1" }],
        [CHAT_DOCUMENT_ATTRIBUTE]: [{ id: "doc-1" }],
        [CHAT_CITATION_ATTRIBUTE]: [{ id: "cit-1" }, { id: "cit-2" }],
      })
    );
    configQueryMock.mockImplementation(
      makeTypedQueryMock({
        [CUSTOMER_ENTITY_ATTRIBUTE]: [{ id: "customer-1" }, { id: "customer-2" }],
        [MEETING_BRIEF_ATTRIBUTE]: [{ id: "brief-1" }],
        [ACTIVITY_EVENT_ATTRIBUTE]: [{ id: "evt-1" }, { id: "evt-2" }, { id: "evt-3" }],
      })
    );
    configItemReadMock.mockResolvedValue({ resource: buildSubjectUserAccount() });
    configItemsCreateMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
    configItemsUpsertMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
    deleteDocumentsByUserMock.mockResolvedValue([
      { status: "OK", response: true },
      { status: "OK", response: true },
    ]);
    deleteBlobsWithPrefixMock.mockImplementation(async (_container: string, prefix: string) => ({
      status: "OK",
      response: prefix === "thread-1/" ? 2 : 1,
    }));
  });

  it("touches every registered store and returns an accurate per-store count", async () => {
    const result = await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_USER_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;

    expect(result.response.counts).toEqual({
      chatThreads: 2,
      chatMessages: 1,
      chatDocuments: 1,
      chatCitations: 2,
      customerEntities: 2,
      meetingBriefs: 1,
      activityEvents: 3,
      searchIndexDocuments: 2,
      blobs: 3,
      userAccount: "anonymized",
    });

    // Every Cosmos document found across both containers was actually deleted.
    expect(historyItemDeleteMock).toHaveBeenCalledTimes(6); // 2 threads + 1 msg + 1 doc + 2 citations
    expect(configItemDeleteMock).toHaveBeenCalledTimes(6); // 2 customers + 1 brief + 3 activity events

    // AI Search scoped by the subject's hashed id.
    expect(deleteDocumentsByUserMock).toHaveBeenCalledWith(SUBJECT_HASHED_ID);

    // Blobs resolved via the subject's own thread ids, not a hardcoded/guessed prefix.
    expect(deleteBlobsWithPrefixMock).toHaveBeenCalledWith("images", "thread-1/");
    expect(deleteBlobsWithPrefixMock).toHaveBeenCalledWith("images", "thread-2/");

    // UserAccount is anonymized (upsert), never hard-deleted.
    expect(configItemsUpsertMock).toHaveBeenCalledTimes(1);
    expect(configItemDeleteMock).not.toHaveBeenCalledWith(SUBJECT_USER_DOC_ID, TENANT);

    // Audit record was written.
    expect(configItemsCreateMock).toHaveBeenCalledTimes(1);
  });

  it("is scoped by BOTH tenantSlug and the subject's own hashed id on every query — never a different seller's data", async () => {
    await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_USER_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    for (const call of historyQueryMock.mock.calls) {
      const [querySpec, options] = call;
      expect(findParam(querySpec, "@userId")).toBe(SUBJECT_HASHED_ID);
      expect(options).toEqual({ partitionKey: SUBJECT_HASHED_ID });
    }

    for (const call of configQueryMock.mock.calls) {
      const [querySpec, options] = call;
      expect(findParam(querySpec, "@tenantSlug")).toBe(TENANT);
      expect(findParam(querySpec, "@subjectId")).toBe(SUBJECT_HASHED_ID);
      expect(options).toEqual({ partitionKey: TENANT });
    }

    // The raw SQL text itself must reference the scoping columns — a param
    // that's bound but never used in `query` would not actually scope
    // anything (same class of bug this codebase already regression-tests
    // for in customer-entity-service.test.ts).
    const customerEntitiesCall = configQueryMock.mock.calls.find(
      ([spec]) => findParam(spec, "@type") === CUSTOMER_ENTITY_ATTRIBUTE
    );
    expect(customerEntitiesCall?.[0].query).toMatch(/c\.ownerId=@subjectId/);

    const activityEventsCall = configQueryMock.mock.calls.find(
      ([spec]) => findParam(spec, "@type") === ACTIVITY_EVENT_ATTRIBUTE
    );
    expect(activityEventsCall?.[0].query).toMatch(/c\.actorId=@subjectId/);
  });

  it("cannot erase another tenant's data — a subject whose UserAccount doc doesn't match the requested tenant returns NOT_FOUND with zero side effects", async () => {
    configItemReadMock.mockResolvedValue({
      resource: buildSubjectUserAccount({ tenantSlug: OTHER_TENANT }),
    });

    const result = await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_USER_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    expect(result.status).toBe("NOT_FOUND");
    expect(historyItemDeleteMock).not.toHaveBeenCalled();
    expect(configItemDeleteMock).not.toHaveBeenCalled();
    expect(deleteDocumentsByUserMock).not.toHaveBeenCalled();
    expect(deleteBlobsWithPrefixMock).not.toHaveBeenCalled();
    expect(configItemsUpsertMock).not.toHaveBeenCalled();
    expect(configItemsCreateMock).not.toHaveBeenCalled();
  });

  it("audit record contains no raw PII beyond hashed ids", async () => {
    const result = await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_USER_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    expect(result.status).toBe("OK");
    expect(configItemsCreateMock).toHaveBeenCalledTimes(1);
    const [auditDoc] = configItemsCreateMock.mock.calls[0];

    expect(auditDoc.type).toBe(GDPR_ERASURE_AUDIT_ATTRIBUTE);
    expect(auditDoc.subjectId).toBe(SUBJECT_HASHED_ID);
    expect(auditDoc.performedById).toBe(ADMIN_HASHED_ID);
    expect(auditDoc.tenantSlug).toBe(TENANT);

    const serialized = JSON.stringify(auditDoc);
    expect(serialized).not.toMatch(/real\.seller@example\.com/);
    expect(serialized).not.toMatch(/Real Seller Name/i);
    expect(serialized).not.toContain("@example.com");

    // Exact allow-listed field set — nothing extra could smuggle PII in later.
    expect(Object.keys(auditDoc).sort()).toEqual(
      ["counts", "id", "performedById", "subjectId", "tenantSlug", "timestamp", "type", "userId"].sort()
    );
  });

  it("anonymizes rather than hard-deletes the UserAccount, stripping PII while keeping the doc for audit", async () => {
    await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_USER_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    expect(configItemsUpsertMock).toHaveBeenCalledTimes(1);
    const [anonymized] = configItemsUpsertMock.mock.calls[0];

    expect(anonymized.displayName).not.toBe("Real Seller Name");
    expect(anonymized.email).not.toBe("real.seller@example.com");
    expect(anonymized.tags).toEqual({});
    expect(anonymized.lastLoginAt).toBeNull();
    // Identity anchors survive — required for the doc's own Cosmos identity
    // and admin-side lookups; erasure ≠ losing the ability to prove it happened.
    expect(anonymized.id).toBe(SUBJECT_USER_DOC_ID);
    expect(anonymized.canonicalUserId).toBe(SUBJECT_HASHED_ID);
    expect(anonymized.tenantSlug).toBe(TENANT);
  });
});

// ---------------------------------------------------------------------------
// ADR-003 — `canonicalUserId` is nullable on `UserAccount` (an admin
// pre-provisioned "invite by email" entry that has never signed in has no
// real oid yet — see user-service.ts's `CreateUser`/`findPendingInviteByEmail`).
// A GDPR erasure request against such a subject must still succeed (and
// still be a COMPLETE erasure — there is nothing else to erase, since every
// erasable store is keyed by a non-null canonicalUserId), never crash or
// silently query with `null`/`undefined`.
// ---------------------------------------------------------------------------
describe("EraseDataSubject — never-logged-in invitee (canonicalUserId: null)", () => {
  const PENDING_INVITE_DOC_ID = `user-${TENANT}-pending-invite-abc`;

  beforeEach(() => {
    historyQueryMock.mockReset();
    historyItemDeleteMock.mockReset();
    historyItemMock.mockClear();
    configQueryMock.mockReset();
    configItemReadMock.mockReset();
    configItemDeleteMock.mockReset();
    configItemMock.mockClear();
    configItemsCreateMock.mockReset();
    configItemsUpsertMock.mockReset();
    deleteBlobsWithPrefixMock.mockReset();
    deleteDocumentsByUserMock.mockReset();

    // Every store-query mock would return data if queried at all — the
    // assertions below prove `EraseDataSubject` never calls them for this
    // subject, precisely because there is no canonicalUserId to scope by.
    historyQueryMock.mockImplementation(
      makeTypedQueryMock({
        [CHAT_THREAD_ATTRIBUTE]: [{ id: "should-not-be-touched" }],
      })
    );
    configQueryMock.mockImplementation(
      makeTypedQueryMock({
        [CUSTOMER_ENTITY_ATTRIBUTE]: [{ id: "should-not-be-touched" }],
      })
    );
    configItemReadMock.mockResolvedValue({
      resource: buildSubjectUserAccount({
        id: PENDING_INVITE_DOC_ID,
        canonicalUserId: null,
        lastLoginAt: null,
      }),
    });
    configItemsCreateMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
    configItemsUpsertMock.mockImplementation(async (doc: unknown) => ({ resource: doc }));
  });

  it("skips every per-subject store lookup (nothing could be scoped to a null id) and returns all-zero counts", async () => {
    const result = await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: PENDING_INVITE_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;

    expect(result.response.counts).toEqual({
      chatThreads: 0,
      chatMessages: 0,
      chatDocuments: 0,
      chatCitations: 0,
      customerEntities: 0,
      meetingBriefs: 0,
      activityEvents: 0,
      searchIndexDocuments: 0,
      blobs: 0,
      userAccount: "anonymized",
    });

    expect(historyQueryMock).not.toHaveBeenCalled();
    expect(configQueryMock).not.toHaveBeenCalled();
    expect(deleteDocumentsByUserMock).not.toHaveBeenCalled();
    expect(deleteBlobsWithPrefixMock).not.toHaveBeenCalled();
    expect(historyItemDeleteMock).not.toHaveBeenCalled();
    expect(configItemDeleteMock).not.toHaveBeenCalled();

    // The directory doc itself is still anonymized — erasure is complete
    // even though there was nothing else to erase.
    expect(configItemsUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("records the audit trail with the literal subjectId \"never-logged-in\" instead of null/undefined", async () => {
    const result = await EraseDataSubject({
      tenantSlug: TENANT,
      subjectUserId: PENDING_INVITE_DOC_ID,
      performedById: ADMIN_HASHED_ID,
    });

    expect(result.status).toBe("OK");
    expect(configItemsCreateMock).toHaveBeenCalledTimes(1);
    const [auditDoc] = configItemsCreateMock.mock.calls[0];
    expect(auditDoc.subjectId).toBe("never-logged-in");
  });
});
