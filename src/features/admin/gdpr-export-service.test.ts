import { beforeEach, describe, expect, it, vi } from "vitest";

const historyQueryMock = vi.hoisted(() => vi.fn());
const configQueryMock = vi.hoisted(() => vi.fn());
const configItemReadMock = vi.hoisted(() => vi.fn());

// Mutating members are mocked as throwing rather than as no-ops: an access
// request must never mutate the record it reports on, and a silent no-op mock
// would let a stray delete/upsert slip in unnoticed.
const forbidden = (name: string) => () => {
  throw new Error(`gdpr-export must never call ${name}()`);
};

vi.mock("@/features/common/services/cosmos", () => ({
  HistoryContainer: () => ({
    items: {
      query: historyQueryMock,
      upsert: forbidden("HistoryContainer.items.upsert"),
      create: forbidden("HistoryContainer.items.create"),
    },
    item: () => ({ delete: forbidden("HistoryContainer.item.delete") }),
  }),
  ConfigContainer: () => ({
    items: {
      query: configQueryMock,
      upsert: forbidden("ConfigContainer.items.upsert"),
      create: forbidden("ConfigContainer.items.create"),
    },
    item: () => ({
      read: configItemReadMock,
      delete: forbidden("ConfigContainer.item.delete"),
    }),
  }),
}));

vi.mock("@/features/common/services/safe-logger", () => ({
  safeLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES,
  ERASABLE_DOCUMENT_TYPES,
} from "./gdpr-erasure-service";
import {
  EXPORTED_ANONYMIZED_STORE_KEYS,
  EXPORTED_STORE_KEYS,
  ExportDataSubject,
} from "./gdpr-export-service";
import { USER_ACCOUNT_ATTRIBUTE, UserAccount } from "./user-service";

const TENANT = "dsv";
const OTHER_TENANT = "atea";
const SUBJECT_ID = "tenant-a:subject-oid";
const ADMIN_ID = "tenant-a:admin-oid";
const SUBJECT_DOC_ID = `user-${TENANT}-subject`;

const buildSubject = (overrides: Partial<UserAccount> = {}): UserAccount => ({
  id: SUBJECT_DOC_ID,
  type: USER_ACCOUNT_ATTRIBUTE,
  userId: TENANT,
  tenantSlug: TENANT,
  canonicalUserId: SUBJECT_ID,
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

const paramOf = (spec: QuerySpec, name: string) =>
  spec.parameters.find((p) => p.name === name)?.value;

/** One canned document per type, so every store is distinguishable in the result. */
const respondPerType = (mock: ReturnType<typeof vi.fn>) =>
  mock.mockImplementation((spec: QuerySpec) => {
    const type = paramOf(spec, "@type") as string;
    return { fetchAll: async () => ({ resources: [{ id: `${type}-1`, type }] }) };
  });

describe("gdpr-export-service — store coverage mirrors erasure", () => {
  it("reads back every store the erasure registry deletes", () => {
    // Derived from the erasure registry, never hand-listed. SR-013: two
    // hand-maintained lists do not check each other, they agree.
    expect(EXPORTED_STORE_KEYS.sort()).toEqual(
      Object.keys(ERASABLE_DOCUMENT_TYPES).sort()
    );
  });

  it("covers the anonymized-not-erased store too", () => {
    expect(EXPORTED_ANONYMIZED_STORE_KEYS).toEqual(
      Object.keys(ANONYMIZED_NOT_ERASED_DOCUMENT_TYPES)
    );
  });
});

describe("ExportDataSubject", () => {
  beforeEach(() => {
    historyQueryMock.mockReset();
    configQueryMock.mockReset();
    configItemReadMock.mockReset();
    respondPerType(historyQueryMock);
    respondPerType(configQueryMock);
    configItemReadMock.mockResolvedValue({ resource: buildSubject() });
  });

  it("returns a document set and a count for every registered store", async () => {
    const result = await ExportDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_DOC_ID,
      performedById: ADMIN_ID,
    });

    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;

    for (const key of Object.keys(ERASABLE_DOCUMENT_TYPES)) {
      expect(result.response.documents[key], `missing store: ${key}`).toBeDefined();
      expect(result.response.counts[key]).toBe(1);
    }

    expect(result.response.subjectId).toBe(SUBJECT_ID);
    expect(result.response.userAccount.id).toBe(SUBJECT_DOC_ID);
  });

  it("discloses the stores it cannot include rather than omitting them silently", async () => {
    const result = await ExportDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_DOC_ID,
      performedById: ADMIN_ID,
    });
    if (result.status !== "OK") throw new Error("expected OK");

    const stores = result.response.notIncluded.map((n) => n.store).join(" | ");
    expect(stores).toMatch(/AI Search/i);
    expect(stores).toMatch(/[Bb]lob/);
    expect(stores).toMatch(/Application Insights/i);
    // Every exclusion must carry a reason — an unexplained omission is the
    // thing this field exists to prevent.
    for (const entry of result.response.notIncluded) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it("scopes EVERY query to this subject — no query may be unscoped", async () => {
    await ExportDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_DOC_ID,
      performedById: ADMIN_ID,
    });

    for (const [spec, options] of historyQueryMock.mock.calls) {
      expect(paramOf(spec, "@userId")).toBe(SUBJECT_ID);
      expect(options).toEqual({ partitionKey: SUBJECT_ID });
    }

    for (const [spec, options] of configQueryMock.mock.calls) {
      const tenantPartitioned =
        paramOf(spec, "@tenantSlug") === TENANT &&
        paramOf(spec, "@subjectId") === SUBJECT_ID &&
        options?.partitionKey === TENANT;

      const subjectPartitioned =
        paramOf(spec, "@userId") === SUBJECT_ID &&
        options?.partitionKey === SUBJECT_ID;

      expect(
        tenantPartitioned || subjectPartitioned,
        `unscoped ConfigContainer query for ${String(paramOf(spec, "@type"))}`
      ).toBe(true);
    }
  });

  it("reads PROMPT from the subject partition, not the tenant partition", async () => {
    await ExportDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_DOC_ID,
      performedById: ADMIN_ID,
    });

    // Using the tenant-partitioned helper here would match nothing and produce
    // an empty prompts array that looks like a successful export.
    const promptCall = configQueryMock.mock.calls.find(
      ([spec]) => paramOf(spec, "@type") === ERASABLE_DOCUMENT_TYPES.prompts
    );
    expect(promptCall, "PROMPT must be queried").toBeDefined();
    expect(promptCall?.[1]).toEqual({ partitionKey: SUBJECT_ID });
    expect(promptCall?.[0].query).toMatch(/c\.userId=@userId/);
  });

  it("refuses a subject belonging to a different tenant, reading nothing", async () => {
    configItemReadMock.mockResolvedValue({
      resource: buildSubject({ tenantSlug: OTHER_TENANT }),
    });

    const result = await ExportDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_DOC_ID,
      performedById: ADMIN_ID,
    });

    expect(result.status).toBe("NOT_FOUND");
    expect(historyQueryMock).not.toHaveBeenCalled();
    expect(configQueryMock).not.toHaveBeenCalled();
  });

  it("exports an empty but complete set for a subject who never signed in", async () => {
    configItemReadMock.mockResolvedValue({
      resource: buildSubject({ canonicalUserId: null }),
    });

    const result = await ExportDataSubject({
      tenantSlug: TENANT,
      subjectUserId: SUBJECT_DOC_ID,
      performedById: ADMIN_ID,
    });

    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;

    // No canonical id means nothing can be owned — but the account record is
    // still theirs and every store must still be represented, as zero.
    for (const key of Object.keys(ERASABLE_DOCUMENT_TYPES)) {
      expect(result.response.counts[key]).toBe(0);
    }
    expect(result.response.userAccount.id).toBe(SUBJECT_DOC_ID);
    expect(historyQueryMock).not.toHaveBeenCalled();
  });
});
